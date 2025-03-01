// main.ts
import * as dotenv from "dotenv";
import { fetchWeather } from "./tools/fetch_weather";
import { Agent } from "./agent";
import { scrapePages } from "./tools/scrape";
import { searchWeb } from "./tools/serp";

// Load environment variables from .env file
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Please set the OPENAI_API_KEY environment variable in your .env file"
  );
}

async function main() {
  const request = process.argv[2];
  if (!request) {
    console.error("Please provide a request as a command line argument");
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
  
  console.log("\nFinal answer:");
  console.log(answer);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
