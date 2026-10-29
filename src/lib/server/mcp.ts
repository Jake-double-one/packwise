import { isHttpError } from '@sveltejs/kit';
import { DIMENSION_MAP } from '#lib/context.js';
import { analysePlugs, COUNTRIES, countryName, regionOf } from '#lib/data/countries.js';
import { DRIVING } from '#lib/data/driving.js';
import { translate } from '#lib/i18n/index.js';
import { childrenMap } from '#lib/tree.js';
import { parseCar, type Trip, type TripItem } from '#lib/types.js';
import { classifyClimate, seasonOf } from '#lib/weather.js';
import { authenticateToken, type TokenScope } from './apitokens';
import { householdsFor, rateLimit, type AppHousehold, type SessionUser } from './auth';
import { config } from './config';
import { messagesFor } from './i18n';
import { getTrip, listPersons, listSharedTrips, listTripItems, listTrips } from './repo';
import { applyTripOp, broadcastTripOp, createTrip, tripAccessFor, type TripOp } from './trips';
import { geocode, weatherFor } from './weather';

/**
 * MCP server (Model Context Protocol, "Streamable HTTP" transport, stateless,
 * JSON responses) so AI assistants such as Claude, ChatGPT or Grok can read
 * and update packing lists. Every request carries a personal API token; it
 * sees exactly what its user sees, and read tokens cannot change anything.
 */

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface Ctx {
	user: SessionUser;
	scope: TokenScope;
	households: AppHousehold[];
	t: (key: string, params?: Record<string, string | number>) => string;
	locale: string;
	/** public address of this Packwise, for links */
	origin: string;
}

interface Tool {
	name: string;
	description: string;
	write?: boolean;
	inputSchema: Record<string, unknown>;
	run: (args: Record<string, any>, ctx: Ctx) => Promise<string> | string;
}

class ToolError extends Error {}

const str = { type: 'string' };
const tripIdProp = { trip_id: { type: 'string', description: 'Trip id from list_trips' } };

// ── helpers ──────────────────────────────────────────────────────────────────

/** Same access rules as the app: household members and invited trip guests. */
function tripFor(ctx: Ctx, id: unknown): { trip: Trip; hh: AppHousehold } {
	const access = typeof id === 'string' ? tripAccessFor(ctx.user, id) : null;
	if (!access) throw new ToolError(`Trip "${id}" not found. Use list_trips to get trip ids.`);
	return access;
}

function householdFor(ctx: Ctx, name: unknown): AppHousehold {
	if (!ctx.households.length) throw new ToolError('This account is not a member of any household.');
	if (typeof name !== 'string' || !name.trim()) return ctx.households[0];
	const hh = ctx.households.find((h) => h.name.toLowerCase() === name.trim().toLowerCase() || h.id === name);
	if (!hh) throw new ToolError(`Household "${name}" not found. Available: ${ctx.households.map((h) => h.name).join(', ')}`);
	return hh;
}

/** Changes are logged as "<name> (AI)" in the trip's activity log and pushed live to open lists. */
function apply(ctx: Ctx, tripId: string, hh: AppHousehold, op: TripOp) {
	const user = { ...ctx.user, name: `${ctx.user.name} (${ctx.t('mcp.ai')})` };
	const result = applyTripOp(tripId, hh, user, op);
	broadcastTripOp(tripId, hh.id, result, null);
	return result;
}

const today = () => new Date().toISOString().slice(0, 10);

// ── tools ────────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
	{
		name: 'list_trips',
		description: 'List the trips (packing lists) of the user, with dates, destination and packing progress. Past trips only on request.',
		inputSchema: {
			type: 'object',
			properties: { include_past: { type: 'boolean', description: 'Also list trips that have ended' }, household: { ...str, description: 'Household name (optional)' } },
			additionalProperties: false
		},
		run: (args, ctx) => {
			const hhs = args.household ? [householdFor(ctx, args.household)] : ctx.households;
			const lines: string[] = [];
			for (const hh of hhs) {
				const trips = listTrips(hh.id, hh.collapsed)
					.filter((tr) => args.include_past || tr.end_date >= today())
					.sort((a, b) => a.start_date.localeCompare(b.start_date));
				lines.push(`# ${hh.name}`);
				if (!trips.length) lines.push('(no trips)');
				for (const tr of trips) {
					lines.push(
						`- ${tr.name} — id: ${tr.id} — ${tr.destination || (tr.country ? countryName(tr.country, ctx.locale) : '?')}, ${tr.start_date} to ${tr.end_date}, ${tr.withTodos ? 'done' : 'packed'} ${tr.done}/${tr.total}${tr.phase === 'return' ? ', return trip in progress' : ''}`
					);
				}
			}
			if (!args.household) {
				const shared = listSharedTrips(ctx.user.id).filter((tr) => args.include_past || tr.end_date >= today());
				if (shared.length) {
					lines.push('# Shared with me');
					for (const tr of shared) lines.push(`- ${tr.name} — id: ${tr.id} — from ${tr.household_name}, ${tr.start_date} to ${tr.end_date}, ${tr.withTodos ? 'done' : 'packed'} ${tr.done}/${tr.total}`);
				}
			}
			return lines.join('\n');
		}
	},
	{
		name: 'get_packing_list',
		description:
			'Get the packing list of a trip, grouped by category, with item ids, quantities, the traveller an item belongs to and whether it is packed ([x]) or not ([ ]).',
		inputSchema: {
			type: 'object',
			properties: {
				...tripIdProp,
				only_open: { type: 'boolean', description: 'Only items that are not packed yet' },
				traveller: { ...str, description: 'Only items of this traveller (name)' }
			},
			required: ['trip_id'],
			additionalProperties: false
		},
		run: (args, ctx) => {
			const { trip, hh } = tripFor(ctx, args.trip_id);
			const persons = new Map(listPersons(hh.id).map((p) => [p.id, p.name]));
			const items = listTripItems(trip.id);
			const tree = childrenMap(items);
			const returning = trip.phase === 'return';
			const done = (it: TripItem) => (returning ? it.returned : it.checked);
			const who = typeof args.traveller === 'string' ? args.traveller.trim().toLowerCase() : '';
			const keep = (it: TripItem) =>
				(!args.only_open || !done(it)) && (!who || (persons.get(it.person_id ?? '') ?? '').toLowerCase() === who);
			const lines: string[] = [`# ${trip.name} (${trip.start_date} – ${trip.end_date})${returning ? ' — return trip: [x] = packed again' : ''}`];
			const walk = (pid: string | null, depth: number): boolean => {
				let any = false;
				for (const n of tree.get(pid) ?? []) {
					if (n.kind === 'group') {
						const at = lines.length;
						lines.push(`${'#'.repeat(Math.min(depth + 1, 4))} ${n.name}`);
						if (!walk(n.id, depth + 1)) lines.splice(at, 1);
						else any = true;
					} else if (keep(n)) {
						const extra = [n.qty > 1 ? `×${n.qty}` : '', n.person_id ? persons.get(n.person_id) : '', n.note].filter(Boolean).join(', ');
						lines.push(`- [${done(n) ? 'x' : ' '}] ${n.name}${extra ? ` (${extra})` : ''} — id: ${n.id}`);
						any = true;
					}
				}
				return any;
			};
			if (!walk(null, 1)) lines.push(args.only_open ? 'Everything is packed.' : '(empty list)');
			return lines.join('\n');
		}
	},
	{
		name: 'get_trip_info',
		description:
			'Facts about a trip: destination, dates, travellers, weather, hints (plug adapters, vignettes …), driving rules of the destination country and trip notes (secret notes are hidden).',
		inputSchema: { type: 'object', properties: { ...tripIdProp }, required: ['trip_id'], additionalProperties: false },
		run: (args, ctx) => {
			const { trip, hh } = tripFor(ctx, args.trip_id);
			const persons = listPersons(hh.id).filter((p) => trip.settings.persons.includes(p.id));
			const land = trip.country ? countryName(trip.country, ctx.locale) : '';
			const place = trip.destination && trip.destination !== land ? `${trip.destination}${land ? ` (${land})` : ''}` : land || trip.destination || '-';
			const lines = [`# ${trip.name}`, `Destination: ${place}`, `Dates: ${trip.start_date} to ${trip.end_date}`];
			lines.push(`Travellers: ${persons.map((p) => `${p.name} (${p.kind})`).join(', ') || '-'}`);
			const chips = Object.entries(trip.settings.context)
				.filter(([, v]) => v?.length)
				.map(([dim, v]) => `${ctx.t(`dim.${dim}`)}: ${v.map((x) => ctx.t(`ctx.${dim}.${x}`)).join(', ')}`);
			if (chips.length) lines.push(`Context: ${chips.join('; ')}`);
			const w = trip.weather;
			if (w) lines.push(`Weather (${w.source === 'forecast' ? 'forecast' : '10-year average'}): ${Math.round(w.avgMin)}–${Math.round(w.avgMax)} °C, rain on ${Math.round(w.rainShare * 100)} % of days`);
			const plugs = analysePlugs(hh.home_country, trip.country);
			if (plugs && plugs.status !== 'none') lines.push(`Plug adapter needed: type ${plugs.adapterTypes.join('/')}`);
			if (trip.warnings.length) lines.push('Hints:', ...trip.warnings.map((x) => `- ${ctx.t(x.key, x.params as Record<string, string>)}`));
			const d = trip.country ? DRIVING[trip.country] : undefined;
			if (d) {
				const unit = d.unit ?? 'km/h';
				lines.push(
					`Driving rules ${trip.country}: towns ${d.urban}, country roads ${d.rural}${d.expressway ? `, expressways ${d.expressway}` : ''}, motorways ${d.motorway === 'none' ? 'no general limit' : d.motorway} ${unit}; alcohol limit ${d.bac} ‰`,
					...d.notes.map((k) => `- ${ctx.t(`drive.note.${k}`)}`)
				);
			}
			const notes = trip.notes.filter((n) => n.kind !== 'secret');
			const noteText = (n: (typeof notes)[number]) => {
				if (n.kind !== 'car') return n.value;
				const c = parseCar(n.value);
				return [
					c.company,
					c.booking && `booking ${c.booking}`,
					(c.pickup_at || c.pickup_address) && `pick-up ${[c.pickup_at.replace('T', ' '), c.pickup_address].filter(Boolean).join(', ')}`,
					(c.return_at || c.return_address) && `drop-off ${[c.return_at.replace('T', ' '), c.return_address || 'same place'].filter(Boolean).join(', ')}`
				]
					.filter(Boolean)
					.join('; ');
			};
			if (notes.length) lines.push('Notes:', ...notes.map((n) => `- ${n.label || n.kind}: ${noteText(n).replace(/\n/g, ', ')}`));
			return lines.join('\n');
		}
	},
	{
		name: 'check_items',
		write: true,
		description:
			'Mark items of a trip as packed (or unpacked with checked=false). Items are given by id or by name; with a name, all matching items are changed unless a traveller is given. In return-trip mode this marks items as packed again.',
		inputSchema: {
			type: 'object',
			properties: {
				...tripIdProp,
				items: { type: 'array', items: str, description: 'Item ids or item names' },
				checked: { type: 'boolean', description: 'true = packed (default), false = not packed' },
				traveller: { ...str, description: 'Only the items of this traveller (name)' }
			},
			required: ['trip_id', 'items'],
			additionalProperties: false
		},
		run: (args, ctx) => {
			const { trip, hh } = tripFor(ctx, args.trip_id);
			const value = args.checked !== false;
			const persons = new Map(listPersons(hh.id).map((p) => [p.id, p.name]));
			const who = typeof args.traveller === 'string' ? args.traveller.trim().toLowerCase() : '';
			const all = listTripItems(trip.id).filter((i) => i.kind === 'item');
			const changed: string[] = [];
			const missing: string[] = [];
			for (const ref of (Array.isArray(args.items) ? args.items : []).slice(0, 200)) {
				const key = String(ref).trim().toLowerCase();
				const hits = all.filter((i) => (i.id === ref || i.name.toLowerCase() === key) && (!who || (persons.get(i.person_id ?? '') ?? '').toLowerCase() === who));
				if (!hits.length) missing.push(String(ref));
				for (const it of hits) {
					if (trip.phase === 'return') apply(ctx, trip.id, hh, { op: 'return', id: it.id, returned: value });
					else apply(ctx, trip.id, hh, { op: 'check', id: it.id, checked: value });
					changed.push(it.person_id ? `${it.name} (${persons.get(it.person_id)})` : it.name);
				}
			}
			return [
				changed.length ? `${value ? 'Packed' : 'Unpacked'}: ${changed.join(', ')}` : 'Nothing changed.',
				missing.length ? `Not found: ${missing.join(', ')} – use get_packing_list for names and ids.` : ''
			]
				.filter(Boolean)
				.join('\n');
		}
	},
	{
		name: 'add_items',
		write: true,
		description: 'Add items to the packing list of a trip, optionally into a category (by name) and for a traveller.',
		inputSchema: {
			type: 'object',
			properties: {
				...tripIdProp,
				items: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							name: str,
							category: { ...str, description: 'Existing category/group name (optional)' },
							traveller: { ...str, description: 'Traveller name (optional)' },
							qty: { type: 'number' },
							note: str
						},
						required: ['name']
					}
				}
			},
			required: ['trip_id', 'items'],
			additionalProperties: false
		},
		run: (args, ctx) => {
			const { trip, hh } = tripFor(ctx, args.trip_id);
			const persons = listPersons(hh.id);
			const groups = listTripItems(trip.id).filter((i) => i.kind === 'group');
			const added: string[] = [];
			for (const raw of (Array.isArray(args.items) ? args.items : []).slice(0, 100)) {
				const name = String(raw?.name ?? '').trim();
				if (!name) continue;
				const cat = typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : '';
				const group = cat ? groups.find((g) => g.name.toLowerCase() === cat || g.id === raw.category) : undefined;
				const person = typeof raw.traveller === 'string' ? persons.find((p) => p.name.toLowerCase() === raw.traveller.trim().toLowerCase()) : undefined;
				const patch: Record<string, unknown> = {};
				if (person) patch.person_id = person.id;
				if (typeof raw.qty === 'number') patch.qty = raw.qty;
				if (typeof raw.note === 'string') patch.note = raw.note;
				apply(ctx, trip.id, hh, { op: 'add', parent_id: group?.id ?? null, kind: 'item', name, patch });
				added.push(`${name}${group ? ` → ${group.name}` : ''}${person ? ` (${person.name})` : ''}`);
			}
			return added.length ? `Added: ${added.join(', ')}` : 'Nothing added.';
		}
	},
	{
		name: 'create_trip',
		write: true,
		description:
			"Create a new trip. Packwise generates the packing list from the household's template using destination, dates, weather, travellers and the chosen context (transport, accommodation, activities).",
		inputSchema: {
			type: 'object',
			properties: {
				destination: { ...str, description: 'Place, e.g. "Palma de Mallorca" or "Kühlungsborn"' },
				start: { ...str, description: 'YYYY-MM-DD' },
				end: { ...str, description: 'YYYY-MM-DD' },
				name: { ...str, description: 'Name of the trip (optional)' },
				country: { ...str, description: 'ISO country code if the place is ambiguous, e.g. "ES"' },
				travellers: { type: 'array', items: str, description: 'Names of the travellers; default: all people of the household' },
				transport: { type: 'array', items: { type: 'string', enum: DIMENSION_MAP.transport.values } },
				stay: { type: 'array', items: { type: 'string', enum: DIMENSION_MAP.stay.values } },
				activities: { type: 'array', items: { type: 'string', enum: DIMENSION_MAP.activity.values } },
				laundry_days: { type: 'number', description: 'Pack clothes for at most this many days (laundry available)' },
				todos: { type: 'boolean', description: 'Add the to-dos before departure' },
				household: { ...str, description: 'Household name (optional)' }
			},
			required: ['destination', 'start', 'end'],
			additionalProperties: false
		},
		run: async (args, ctx) => {
			const hh = householdFor(ctx, args.household);
			const start = String(args.start ?? '');
			const end = String(args.end ?? '');
			if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new ToolError('start and end must be dates (YYYY-MM-DD), end not before start.');
			const wantedCountry = typeof args.country === 'string' && COUNTRIES[args.country.trim().toUpperCase()] ? args.country.trim().toUpperCase() : null;
			const places = await geocode(String(args.destination ?? ''), ctx.locale);
			const place = places.find((p) => !wantedCountry || p.country_code === wantedCountry) ?? null;
			const country = place?.country_code ?? wantedCountry;
			const weather = place ? await weatherFor(place.lat, place.lon, start, end) : null;
			const all = listPersons(hh.id);
			const names: string[] = Array.isArray(args.travellers) ? args.travellers.map((n: unknown) => String(n).trim().toLowerCase()) : [];
			const persons = names.length ? all.filter((p) => names.includes(p.name.toLowerCase())) : all;
			const pick = (dim: string, v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => DIMENSION_MAP[dim].values.includes(x)) : []);
			const region = regionOf(hh.home_country, country);
			const id = createTrip(
				hh,
				ctx.user,
				{
					name: String(args.name ?? '').trim().slice(0, 120) || (place?.name ?? String(args.destination)).slice(0, 120),
					destination: place ? [place.name, place.admin1].filter(Boolean).join(', ') : String(args.destination).slice(0, 200),
					country,
					lat: place?.lat ?? null,
					lon: place?.lon ?? null,
					start,
					end,
					settings: {
						persons: persons.map((p) => p.id),
						context: {
							transport: pick('transport', args.transport),
							stay: pick('stay', args.stay),
							activity: pick('activity', args.activities),
							climate: classifyClimate(weather),
							season: [seasonOf(start, end, place?.lat)],
							region: region ? [region] : [],
							travelers: [...new Set(persons.map((p) => p.kind))]
						},
						laundryDays: Math.max(0, Math.min(60, Math.round(Number(args.laundry_days) || 0))),
						todos: !!args.todos
					},
					weather,
					forceInclude: [],
					forceExclude: []
				},
				ctx.locale
			);
			const trip = getTrip(id)!;
			const count = listTripItems(id).filter((i) => i.kind === 'item').length;
			return [
				`Created "${trip.name}" — id: ${id} — ${trip.destination || country || ''}, ${start} to ${end}, ${count} items, travellers: ${persons.map((p) => p.name).join(', ')}.`,
				place ? '' : 'Note: the place was not found (or weather is disabled), so there is no weather-based packing.',
				`Open it at ${ctx.origin}/t/${id}`
			]
				.filter(Boolean)
				.join('\n');
		}
	}
];

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

const rpcResult = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleOne(msg: RpcRequest, ctx: Ctx): Promise<object | null> {
	if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
	const isNotification = msg.id === undefined;
	switch (msg.method) {
		case 'initialize': {
			const wanted = String(msg.params?.protocolVersion ?? '');
			return rpcResult(msg.id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: 'packwise', title: 'Packwise', version: __APP_VERSION__ },
				instructions:
					`Packwise holds the packing lists of ${ctx.user.name}'s household. Use list_trips first to find trip ids. ` +
					(ctx.scope === 'write' ? 'This token may read and change lists.' : 'This token is read-only.')
			});
		}
		case 'ping':
			return isNotification ? null : rpcResult(msg.id, {});
		case 'tools/list':
			return rpcResult(msg.id, {
				tools: TOOLS.filter((t) => !t.write || ctx.scope === 'write').map((t) => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema,
					annotations: { readOnlyHint: !t.write, destructiveHint: false }
				}))
			});
		case 'tools/call': {
			const tool = TOOLS.find((t) => t.name === msg.params?.name);
			if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
			const content = (text: string, isError = false) => rpcResult(msg.id, { content: [{ type: 'text', text }], isError });
			if (tool.write && ctx.scope !== 'write') return content('This API token is read-only. Create a token with write access in Packwise → Settings → API tokens.', true);
			try {
				return content(await tool.run(msg.params?.arguments ?? {}, ctx));
			} catch (err) {
				if (err instanceof ToolError) return content(err.message, true);
				if (isHttpError(err)) {
					const key = typeof err.body?.message === 'string' ? err.body.message : 'error';
					return content(ctx.t(key) === key ? `Error ${err.status}: ${key}` : ctx.t(key), true);
				}
				console.error('[mcp]', err);
				return content('Internal error', true);
			}
		}
		default:
			if (isNotification || msg.method.startsWith('notifications/')) return null;
			return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
	}
}

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
	'access-control-expose-headers': 'mcp-session-id'
};

const MAX_BATCH = 50;

const jsonResponse = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
	new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });

/** Entry point for /mcp (token in the Authorization header) and /mcp/<token> (for apps that only take a URL). */
export async function handleMcp(request: Request, pathToken: string | null, clientIp: string, origin: string): Promise<Response> {
	if (!config.mcpEnabled) return jsonResponse({ error: 'MCP is disabled (set MCP_ENABLED=true)' }, 404);
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (request.method === 'GET') return jsonResponse({ error: 'This server does not offer an event stream; use POST.' }, 405, { allow: 'POST' });
	if (request.method === 'DELETE') return jsonResponse(null, 204);
	if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

	if (!rateLimit(`mcp:${clientIp}`, 600, 60_000)) return jsonResponse(rpcError(null, -32000, 'Too many requests'), 429);
	const header = request.headers.get('authorization') ?? '';
	const token = pathToken ?? (header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '');
	const auth = token ? authenticateToken(token) : null;
	if (!auth) {
		if (!rateLimit(`mcp-fail:${clientIp}`, 30)) return jsonResponse(rpcError(null, -32000, 'Too many failed attempts'), 429);
		return jsonResponse(rpcError(null, -32001, 'Missing or invalid API token'), 401, { 'www-authenticate': 'Bearer realm="packwise"' });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse(rpcError(null, -32700, 'Parse error'), 400);
	}
	const locale = auth.user.locale ?? config.defaultLang;
	const messages = messagesFor(locale);
	const ctx: Ctx = {
		user: auth.user,
		scope: auth.scope,
		households: householdsFor(auth.user),
		locale,
		origin,
		t: (k, p) => translate(messages, k, p)
	};
	// batches run one after the other and are capped, so one request can't start hundreds of lookups at once
	if (Array.isArray(body)) {
		if (body.length === 0 || body.length > MAX_BATCH) return jsonResponse(rpcError(null, -32600, `A batch must contain 1 to ${MAX_BATCH} requests`), 400);
		const out: object[] = [];
		for (const m of body) {
			const r = await handleOne(m, ctx);
			if (r) out.push(r);
		}
		return out.length ? jsonResponse(out) : jsonResponse(null, 202);
	}
	const res = await handleOne(body as RpcRequest, ctx);
	return res ? jsonResponse(res) : jsonResponse(null, 202);
}
