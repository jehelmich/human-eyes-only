/**
 * @heo/middleware — public surface.
 *
 * Adapters re-export from here; the Node-specific implementation lives in
 * `./node.ts`.
 */

export type { HeoMiddlewareOptions, MiddlewareErrorPolicy } from "./node.js";
export { heoMiddleware } from "./node.js";
