// hello.ts
import * as dotenv from "dotenv";
import { fetchWeather } from "./tools/fetch_weather";
import { Agent } from "./agent";

// Load environment variables from .env file
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
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

  // Initialize agent with a goal
  const agent = await Agent.create(
    "Help users get weather information for cities around the world",
    apiKey as string
  );

  // Define available tools
  const tools = {
    fetch_weather: fetchWeather,
  };

  // Run a step with the user's request
  const { stdout, stderr } = await agent.step(tools, request);

  // Output results
  if (stdout) console.log("\nOutput:", stdout);
  if (stderr) console.log("\nErrors:", stderr);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
