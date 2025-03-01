// main.ts
import * as dotenv from "dotenv";
import { fetchWeather } from "./tools/fetch_weather";
import { Agent } from "./agent";
import { scrapePages } from "./tools/scrape";
import { searchWeb } from "./tools/serp";
import { logger, LogLevel } from "./utils/logger";
import { ConfigurationError, wrapError } from "./utils/errors";
import type { AnyTool } from "./tools/types";
import { loadModelConfig } from "./utils/config";

// Load environment variables from .env file
dotenv.config();

async function main() {
  try {
    // Set log level from environment variable or default to INFO
    const logLevelStr = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    const logLevel = LogLevel[logLevelStr as keyof typeof LogLevel] ?? LogLevel.INFO;
    logger.setLevel(logLevel);
    
    // Load and validate model configuration (this will throw if required env vars are missing)
    loadModelConfig();
    
    const request = process.argv[2];
    if (!request) {
      logger.error("Please provide a request as a command line argument");
      process.exit(1);
    }

    const agent = await Agent.create(request);
    // Convert typed tools to AnyTool for compatibility
    const asAnyTool = <T>(tool: T): AnyTool => tool as unknown as AnyTool;
    
    const tools: Record<string, AnyTool> = {
      fetch_weather: asAnyTool(fetchWeather),
      scrape_pages: asAnyTool(scrapePages),
      search_web: asAnyTool(searchWeb),
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
  } catch (error) {
    // Wrap and log the error with full context
    const wrappedError = wrapError(error, "Failed to execute agent");
    logger.logError(wrappedError, "Application terminated with error");
    process.exit(1);
  }
}

main();
