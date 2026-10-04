/** Up to three levels of groups: category › subcategory › item group. Items may sit at any level. */
export const MAX_GROUP_DEPTH = 3;

export interface TreeNode {
	id: string;
	parent_id: string | null;
	sort: number;
	kind: 'group' | 'item';
}

export function childrenMap<T extends TreeNode>(nodes: T[]): Map<string | null, T[]> {
	const map = new Map<string | null, T[]>();
	for (const n of nodes) {
		const list = map.get(n.parent_id) ?? [];
		list.push(n);
		map.set(n.parent_id, list);
	}
	for (const list of map.values()) list.sort((a, b) => a.sort - b.sort);
	return map;
}

export function depthOf<T extends TreeNode>(nodes: T[], id: string | null): number {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	let depth = 0;
	for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) depth++;
	return depth;
}

export function descendants<T extends TreeNode>(nodes: T[], id: string): T[] {
	const map = childrenMap(nodes);
	const out: T[] = [];
	const walk = (pid: string) => {
		for (const c of map.get(pid) ?? []) {
			out.push(c);
			walk(c.id);
		}
	};
	walk(id);
	return out;
}

export function ancestors<T extends TreeNode>(nodes: T[], id: string | null): T[] {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const out: T[] = [];
	for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) out.unshift(cur);
	return out;
}

/** Merge upserts / removals into a list (used by live updates). */
export function mergeNodes<T extends { id: string }>(list: T[], upsert: T[] = [], removed: string[] = []): T[] {
	const gone = new Set(removed);
	const map = new Map(list.filter((n) => !gone.has(n.id)).map((n) => [n.id, n]));
	for (const u of upsert) if (!gone.has(u.id)) map.set(u.id, u);
	return [...map.values()];
}
