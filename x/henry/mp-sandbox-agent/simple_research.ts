// simple_research.ts
import * as dotenv from "dotenv";
import { Agent } from "./agent";
import { fetchWeather } from "./tools/fetch_weather";
import { scrapePages } from "./tools/scrape";
import { searchWeb } from "./tools/serp";
import { logger, LogLevel } from "./utils/logger";
import { wrapError } from "./utils/errors";
import type { AnyTool } from "./tools/types";
import { loadModelConfig } from "./utils/config";

// Load environment variables from .env file
dotenv.config();

async function main() {
  try {
    // Set log level to INFO
    logger.setLevel(LogLevel.INFO);
    logger.setTimestamps(false); // Cleaner output
    
    // Load and validate model configuration
    loadModelConfig();
    
    const request = "Deeply research what diffusion LLMs are. Focus on the most recent news and developments. Be thorough and comprehensive in your research, covering the technical concepts, recent breakthroughs, and practical applications.";

    console.log("# Research on Diffusion LLMs with Claude 3.7\n");
    console.log("Query: " + request + "\n");

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
    
    console.log("\n## Final Research Results\n");
    console.log(answer);
    
  } catch (error) {
    // Wrap and log the error with full context
    const wrappedError = wrapError(error, "Failed to execute agent");
    logger.logError(wrappedError, "Application terminated with error");
    process.exit(1);
  }
}

main();
