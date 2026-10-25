import { AsyncLocalStorage } from 'node:async_hooks';
// Netlify's trusted invocation context, isolated per request (never browser input).
export const deployment = new AsyncLocalStorage<{ context: string; id: string }>();
