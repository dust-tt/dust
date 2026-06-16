import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  method: string;
  route: string;
  url: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
