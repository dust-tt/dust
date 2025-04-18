import Bottleneck from "bottleneck";

export const hubspotLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 100, // 10 requests per second
});
