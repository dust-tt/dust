import { LoggerInterface } from "./logger";
type RetryOptions = {
    retries?: number;
    delayBetweenRetriesMs?: number;
};
export declare function withRetries<T, U>(logger: LoggerInterface, fn: (arg: T) => Promise<U>, { retries, delayBetweenRetriesMs }?: RetryOptions): (arg: T & RetryOptions) => Promise<U>;
export {};
//# sourceMappingURL=retries.d.ts.map