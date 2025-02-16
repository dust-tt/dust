import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (!process.env.FIRECRAWL_API_KEY) {
  console.error("Error: FIRECRAWL_API_KEY environment variable is not set");
  process.exit(1);
}

export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
export const FIRECRAWL_API_URL =
  process.env.FIRECRAWL_API_URL || "https://api.firecrawl.dev";

// OpenAI configuration
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "o3-mini";

// SerpAPI configuration
export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
export const SERPAPI_DEFAULT_ENGINE = process.env.SERPAPI_ENGINE || "google";
