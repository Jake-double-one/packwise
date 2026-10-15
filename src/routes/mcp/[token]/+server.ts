import { clientIp, publicOrigin } from '$lib/server/auth';
import { handleMcp } from '$lib/server/mcp';
import type { RequestHandler } from './$types';

/** MCP endpoint with the token in the URL – for apps where only a server URL can be entered. */
const handler: RequestHandler = (event) => handleMcp(event.request, event.params.token, clientIp(event), publicOrigin(event.request));
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
