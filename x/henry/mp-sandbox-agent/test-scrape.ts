import * as dotenv from "dotenv";
import { scrapePages } from "./tools/scrape";
import { logger, LogLevel } from "./utils/logger";

// Load environment variables from .env file
dotenv.config();

// Set up logger
logger.setLevel(LogLevel.INFO);

async function testScrape() {
  console.log("Testing scrape tool with cleaner logging...");
  
  const result = await scrapePages.fn(
    { urls: ["https://example.com", "https://news.ycombinator.com"] },
    { log: (...args) => console.log(...args) }
  );
  
  console.log("\nTest completed. Tool returned:", 
    result.type === "success" 
      ? `Success with ${result.result.length} results` 
      : `Error: ${result.error}`
  );
}

testScrape().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});