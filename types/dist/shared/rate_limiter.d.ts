import { MaxMessagesTimeframeType } from "../front/plan";
import { LoggerInterface } from "../shared/logger";
import { Result } from "./result";
export declare class RateLimitError extends Error {
}
export declare const RATE_LIMITER_PREFIX = "rate_limiter";
interface RateLimiterOptionsBase {
    key: string;
    redisUri?: string;
}
export declare function rateLimiter({ key, maxPerTimeframe, timeframeSeconds, logger, redisUri, }: {
    logger: LoggerInterface;
    maxPerTimeframe: number;
    timeframeSeconds: number;
} & RateLimiterOptionsBase): Promise<number>;
export declare function expireRateLimiterKey({ key, redisUri, }: RateLimiterOptionsBase): Promise<Result<boolean, Error>>;
export declare function getTimeframeSecondsFromLiteral(timeframeLiteral: MaxMessagesTimeframeType): number;
export {};
//# sourceMappingURL=rate_limiter.d.ts.map