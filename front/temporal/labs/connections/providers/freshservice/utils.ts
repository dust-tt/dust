import Bottleneck from "bottleneck";

// The lowest rate limit for a 'Starter' plan API is 40 requests per minute
export const freshServiceLimiter = new Bottleneck({
  maxConcurrent: 20,
  minTime: 2000, // 30 rpm (intentionally providing a buffer))
});
