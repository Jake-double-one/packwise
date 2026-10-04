/**
 * Country data: socket types, mains voltage, frequency and currency.
 * Source: IEC World Plugs (compiled by hand). Format: CODE:PLUGS:VOLT:HZ:CURRENCY
 */
const RAW = `
AD:CF:230:50:EUR AE:CDG:230:50:AED AF:CF:220:50:AFN AG:AB:230:60:XCD AL:CF:230:50:ALL AM:CF:230:50:AMD
AO:C:220:50:AOA AR:CI:220:50:ARS AT:CF:230:50:EUR AU:I:230:50:AUD AW:ABF:120:60:AWG AZ:CF:220:50:AZN
BA:CF:230:50:BAM BB:AB:115:50:BBD BD:ACDGK:220:50:BDT BE:CE:230:50:EUR BF:CE:220:50:XOF BG:CF:230:50:EUR
BH:G:230:50:BHD BI:CE:220:50:BIF BJ:CE:220:50:XOF BN:G:240:50:BND BO:AC:230:50:BOB BR:CN:127:60:BRL
BS:AB:120:60:BSD BT:CDFGM:230:50:BTN BW:DGM:230:50:BWP BY:CF:220:50:BYN BZ:ABG:110:60:BZD CA:AB:120:60:CAD
CD:CDE:220:50:CDF CF:CE:220:50:XAF CG:CE:230:50:XAF CH:CJ:230:50:CHF CI:CE:220:50:XOF CL:CL:220:50:CLP
CM:CE:220:50:XAF CN:ACI:220:50:CNY CO:AB:110:60:COP CR:AB:120:60:CRC CU:ABCL:110:60:CUP CV:CF:230:50:CVE
CY:G:230:50:EUR CZ:CE:230:50:CZK DE:CF:230:50:EUR DJ:CE:220:50:DJF DK:CEFK:230:50:DKK DM:DG:230:50:XCD
DO:AB:120:60:DOP DZ:CF:230:50:DZD EC:AB:120:60:USD EE:CF:230:50:EUR EG:CF:220:50:EGP ER:CL:230:50:ERN
ES:CF:230:50:EUR ET:CEFL:220:50:ETB FI:CF:230:50:EUR FJ:I:240:50:FJD FM:AB:120:60:USD FO:CEFK:230:50:DKK
FR:CE:230:50:EUR GA:C:220:50:XAF GB:G:230:50:GBP GD:G:230:50:XCD GE:CF:220:50:GEL GH:DG:230:50:GHS
GI:G:240:50:GIP GL:CEFK:230:50:DKK GM:G:230:50:GMD GN:CFK:220:50:GNF GQ:CE:220:50:XAF GR:CF:230:50:EUR
GT:AB:120:60:GTQ GU:AB:110:60:USD GW:C:220:50:XOF GY:ABDG:240:60:GYD HK:G:220:50:HKD HN:AB:120:60:HNL
HR:CF:230:50:EUR HT:AB:110:60:HTG HU:CF:230:50:HUF ID:CF:230:50:IDR IE:G:230:50:EUR IL:CH:230:50:ILS
IN:CDM:230:50:INR IQ:CDG:230:50:IQD IR:CF:230:50:IRR IS:CF:230:50:ISK IT:CFL:230:50:EUR JM:AB:110:50:JMD
JO:BCDFGJ:230:50:JOD JP:AB:100:50:JPY KE:G:240:50:KES KG:CF:220:50:KGS KH:ACG:230:50:KHR KM:CE:220:50:KMF
KN:DG:230:60:XCD KR:CF:220:60:KRW KW:CG:240:50:KWD KY:AB:120:60:KYD KZ:CF:220:50:KZT LA:ABCEF:230:50:LAK
LB:ABCDG:220:50:LBP LC:G:240:50:XCD LI:CJ:230:50:CHF LK:DGM:230:50:LKR LR:AB:120:60:LRD LS:M:220:50:LSL
LT:CF:230:50:EUR LU:CF:230:50:EUR LV:CF:230:50:EUR LY:CL:230:50:LYD MA:CE:220:50:MAD MC:CDEF:230:50:EUR
MD:CF:230:50:MDL ME:CF:230:50:EUR MG:CDEJK:220:50:MGA MK:CF:230:50:MKD ML:CE:220:50:XOF MM:CDFG:230:50:MMK
MN:CE:230:50:MNT MO:DGM:220:50:MOP MR:C:220:50:MRU MT:G:230:50:EUR MU:CG:230:50:MUR MV:CDGJKL:230:50:MVR
MW:G:230:50:MWK MX:AB:127:60:MXN MY:G:240:50:MYR MZ:CFM:220:50:MZN NA:DM:220:50:NAD NC:CF:220:50:XPF
NE:ABCDEF:220:50:XOF NG:DG:240:50:NGN NI:AB:120:60:NIO NL:CF:230:50:EUR NO:CF:230:50:NOK NP:CDM:230:50:NPR
NZ:I:230:50:NZD OM:CG:240:50:OMR PA:AB:120:60:USD PE:ABC:220:60:PEN PF:ABE:220:60:XPF PG:I:240:50:PGK
PH:ABC:220:60:PHP PK:CD:230:50:PKR PL:CE:230:50:PLN PR:AB:120:60:USD PS:CH:230:50:ILS PT:CF:230:50:EUR
PY:C:220:50:PYG QA:DG:240:50:QAR RE:CE:230:50:EUR RO:CF:230:50:RON RS:CF:230:50:RSD RU:CF:220:50:RUB
RW:CJ:230:50:RWF SA:ABG:230:60:SAR SB:GI:230:50:SBD SC:G:240:50:SCR SD:CD:230:50:SDG SE:CF:230:50:SEK
SG:G:230:50:SGD SI:CF:230:50:EUR SK:CE:230:50:EUR SL:DG:230:50:SLE SM:CFL:230:50:EUR SN:CDEK:230:50:XOF
SO:C:220:50:SOS SR:CF:127:60:SRD SV:AB:120:60:USD SY:CEL:220:50:SYP SZ:M:230:50:SZL TD:CDEF:220:50:XAF
TG:C:220:50:XOF TH:ABCO:230:50:THB TJ:CF:220:50:TJS TL:CEFI:220:50:USD TM:BCF:220:50:TMT TN:CE:230:50:TND
TO:I:240:50:TOP TR:CF:230:50:TRY TT:AB:115:60:TTD TW:AB:110:60:TWD TZ:DG:230:50:TZS UA:CF:230:50:UAH
UG:G:240:50:UGX US:AB:120:60:USD UY:CFIL:220:50:UYU UZ:CF:220:50:UZS VA:CFL:230:50:EUR VC:ACEGIK:230:50:XCD
VE:AB:120:60:VES VG:AB:110:60:USD VI:AB:110:60:USD VN:ACF:220:50:VND VU:I:220:50:VUV WS:I:230:50:WST
XK:CF:230:50:EUR YE:ADG:230:50:YER ZA:CDMN:230:50:ZAR ZM:CDG:230:50:ZMW ZW:DG:220:50:ZWG
`;

export interface CountryInfo {
	code: string;
	plugs: string[];
	voltage: number;
	hz: number;
	currency: string;
}

export const COUNTRIES: Record<string, CountryInfo> = Object.fromEntries(
	RAW.trim()
		.split(/\s+/)
		.map((entry) => {
			const [code, plugs, voltage, hz, currency] = entry.split(':');
			return [code, { code, plugs: plugs.split(''), voltage: +voltage, hz: +hz, currency }];
		})
);

/** EU member states. */
export const EU = new Set(
	'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ')
);
/** Countries treated like the EU for the "region" context (Schengen/EFTA and micro-states). */
export const EU_LIKE = new Set([...EU, 'CH', 'NO', 'IS', 'LI', 'AD', 'MC', 'SM', 'VA']);

/** Countries driving on the left. */
export const LEFT_HAND_TRAFFIC = new Set(
	'GB IE MT CY AU NZ JP IN ZA TH MY SG HK MO ID KE TZ UG ZM ZW BW NA LS SZ MZ MW JM BS BB TT GY SR LK BD NP BT PK MU SC FJ PG WS TO'.split(
		' '
	)
);

/** Which socket types a given plug type physically fits into. */
const PLUG_FITS: Record<string, string[]> = {
	A: ['A', 'B'],
	B: ['B'],
	C: ['C', 'E', 'F', 'J', 'K', 'L', 'N'],
	D: ['D'],
	E: ['E', 'F'],
	F: ['F', 'E'],
	G: ['G'],
	H: ['H'],
	I: ['I'],
	J: ['J'],
	K: ['K'],
	L: ['L'],
	M: ['M'],
	N: ['N'],
	O: ['O']
};

export interface PlugAnalysis {
	/** none: everything fits · partial: some home plugs fit · needed: nothing fits */
	status: 'none' | 'partial' | 'needed';
	/** home plug types that do not fit any destination socket */
	unfit: string[];
	/** destination socket types an adapter should provide */
	adapterTypes: string[];
	homeVoltage: number;
	destVoltage: number;
	voltageMismatch: boolean;
}

export function analysePlugs(home: string | null | undefined, dest: string | null | undefined): PlugAnalysis | null {
	const h = home ? COUNTRIES[home] : undefined;
	const d = dest ? COUNTRIES[dest] : undefined;
	if (!h || !d || h.code === d.code) return null;
	const unfit = h.plugs.filter((p) => !d.plugs.some((s) => (PLUG_FITS[p] ?? [p]).includes(s)));
	const status = unfit.length === 0 ? 'none' : unfit.length === h.plugs.length ? 'needed' : 'partial';
	// Type C is a plug-only standard – sockets are almost always one of the others.
	const sockets = d.plugs.length > 1 ? d.plugs.filter((p) => p !== 'C') : d.plugs;
	const adapterTypes = sockets.filter((s) => !h.plugs.some((p) => (PLUG_FITS[p] ?? [p]).includes(s)));
	const low = (v: number) => v <= 130;
	return {
		status,
		unfit,
		adapterTypes: adapterTypes.length ? adapterTypes : sockets,
		homeVoltage: h.voltage,
		destVoltage: d.voltage,
		voltageMismatch: low(h.voltage) !== low(d.voltage)
	};
}

export function regionOf(home: string | null | undefined, dest: string | null | undefined): string | null {
	if (!dest) return null;
	if (home && home === dest) return 'domestic';
	return EU_LIKE.has(dest) ? 'eu' : 'non_eu';
}

export function countryName(code: string, locale: string): string {
	try {
		return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
	} catch {
		return code;
	}
}

export function currencyName(code: string, locale: string): string {
	try {
		return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
	} catch {
		return code;
	}
}

export function countryFlag(code: string | null | undefined): string {
	if (!code || code.length !== 2) return '🏳️';
	return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function sortedCountries(locale: string): { code: string; name: string }[] {
	return Object.keys(COUNTRIES)
		.map((code) => ({ code, name: countryName(code, locale) }))
		.sort((a, b) => a.name.localeCompare(b.name, locale));
}
