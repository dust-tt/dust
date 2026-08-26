import { AsyncLocalStorage } from "node:async_hooks";

type TemporalActivityContext = {
  activityName: string;
};

const temporalActivityContext =
  new AsyncLocalStorage<TemporalActivityContext>();

export function runWithTemporalActivityContext<T>(
  activityName: string,
  fn: () => T
): T {
  return temporalActivityContext.run({ activityName }, fn);
}

export function getTemporalActivityContext():
  | TemporalActivityContext
  | undefined {
  return temporalActivityContext.getStore();
}
