import "dotenv/config";

export const Config = {
  // Workspace generation settings
  DATABASES_COUNT: parseInt(process.env.DATABASES_COUNT || "5"),
  PAGES_COUNT: parseInt(process.env.PAGES_COUNT || "20"),
  CHILDREN_PER_PAGE: parseInt(process.env.CHILDREN_PER_PAGE || "5"),
  MAX_DEPTH: parseInt(process.env.MAX_DEPTH || "3"),

  // Activity simulation settings
  SIMULATE_ACTIVITY: process.env.SIMULATE_ACTIVITY === "true",
  ACTIVITY_INTERVAL_MS: parseInt(process.env.ACTIVITY_INTERVAL_MS || "60000"), // 1 minute
  ACTIVITY_DURATION_MS: parseInt(process.env.ACTIVITY_DURATION_MS || "3600000"), // 1 hour
  UPDATES_PER_INTERVAL: parseInt(process.env.UPDATES_PER_INTERVAL || "3"),

  // Rate limiting settings
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "5"),
  INITIAL_RETRY_DELAY_MS: parseInt(
    process.env.INITIAL_RETRY_DELAY_MS || "1000"
  ),
  MAX_RETRY_DELAY_MS: parseInt(process.env.MAX_RETRY_DELAY_MS || "30000"),
};
