export type CRAWLER_REDIS_KEY =
  | "folders"
  | "too_large_page"
  | "upserting_errors";

export const makeCrawlerRedisKey = (
  key: CRAWLER_REDIS_KEY,
  configId: number
) => {
  return `webcrawler:${configId}:${key}`;
};
