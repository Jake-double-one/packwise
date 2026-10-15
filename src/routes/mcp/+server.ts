import { clientIp, publicOrigin } from '$lib/server/auth';
import { handleMcp } from '$lib/server/mcp';
import type { RequestHandler } from './$types';

/** MCP endpoint – token in the Authorization header (Bearer). */
const handler: RequestHandler = (event) => handleMcp(event.request, null, clientIp(event), publicOrigin(event.request));
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
