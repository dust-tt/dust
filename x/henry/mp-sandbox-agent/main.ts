// main.ts
import * as dotenv from "dotenv";
import { fetchWeather } from "./tools/fetch_weather";
import { Agent } from "./agent";
import { scrapePages } from "./tools/scrape";
import { searchWeb } from "./tools/serp";
import { logger, LogLevel } from "./utils/logger";

// Load environment variables from .env file
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Please set the OPENAI_API_KEY environment variable in your .env file"
  );
}

async function main() {
  // Set log level from environment variable or default to INFO
  const logLevelStr = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
  const logLevel = LogLevel[logLevelStr as keyof typeof LogLevel] ?? LogLevel.INFO;
  logger.setLevel(logLevel);
  
  const request = process.argv[2];
  if (!request) {
    logger.error("Please provide a request as a command line argument");
    process.exit(1);
  }

  const agent = await Agent.create(request);
  const tools = {
    fetch_weather: fetchWeather,
    scrape_pages: scrapePages,
    search_web: searchWeb,
  };
  
  let answer: string | null = null;
  while (answer === null) {
    answer = await agent.step(tools);
  }
  
  // Always show the final answer, even at ERROR level
  const currentLevel = logger.getLevel();
  logger.setLevel(LogLevel.INFO);
  logger.setTimestamps(false);
  logger.setShowLevel(false);
  logger.info("\nFinal answer:");
  logger.info(answer);
  
  // Reset logger settings
  logger.setTimestamps(true);
  logger.setShowLevel(true);
  logger.setLevel(currentLevel);
}

main().catch((error) => {
  logger.error("Error: %s", error.message);
  logger.debug("Stack trace: %s", error.stack);
  process.exit(1);
});
