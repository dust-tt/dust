export type CheckFunction = (
  checkName: string,
  reportSuccess: (reportPayload: unknown) => void,
  reportFailure: (reportPayload: unknown, message: string) => void
) => Promise<void>;

export type Check = {
  name: string;
  check: CheckFunction;
};
