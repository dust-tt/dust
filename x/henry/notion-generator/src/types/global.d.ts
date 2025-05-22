// Global type declarations for environment variables
// This extends the types from @types/node

declare namespace NodeJS {
  interface ProcessEnv {
    NOTION_API_KEY?: string;
    PARENT_PAGE_ID?: string;
    DATABASES_COUNT?: string;
    PAGES_COUNT?: string;
    CHILDREN_PER_PAGE?: string;
    MAX_DEPTH?: string;
    SIMULATE_ACTIVITY?: string;
    ACTIVITY_INTERVAL_MS?: string;
    ACTIVITY_DURATION_MS?: string;
    UPDATES_PER_INTERVAL?: string;
    MAX_RETRIES?: string;
    INITIAL_RETRY_DELAY_MS?: string;
    MAX_RETRY_DELAY_MS?: string;
  }
}

// Note: No need for custom Faker type definitions as @faker-js/faker includes its own types
