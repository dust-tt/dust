// hello.ts
import * as dotenv from "dotenv";
import { fetchWeather } from "./tools/fetch_weather";
import { Agent } from "./agent";
import { scrapePages } from "./tools/scrape";
import { searchWeb } from "./tools/serp";
import { Workflow } from "./workflow/workflow";

// Load environment variables from .env file
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Please set the OPENAI_API_KEY environment variable in your .env file"
  );
}

// Generate system prompt for the model

async function main() {
  const request = process.argv[2];
  if (!request) {
    console.error("Please provide a request as a command line argument");
    process.exit(1);
  }

  const workflow = new Workflow<string>("Main Flow").addStep(() => ({
    id: "agent",
    name: "Agent",
    execute: async (input, context) => {
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
      return answer;
    },
  }));

  const result = await workflow.execute(request);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
