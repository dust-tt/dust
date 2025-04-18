import Bottleneck from "bottleneck";

export const hubspotLimiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: 100, // 10 requests per second
});
