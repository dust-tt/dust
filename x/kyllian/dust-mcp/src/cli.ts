import { Command } from "commander";
import { authenticate } from "./auth.js";
import { isAuthenticated } from "./config.js";

const program = new Command();

program.name("dust-mcp").description("Dust MCP CLI").version("1.0.0");

program
  .command("auth")
  .description("Authenticate with Dust")
  .action(async () => {
    try {
      // const alreadyAuthenticated = await isAuthenticated();
      // if (alreadyAuthenticated) {
      //   console.log("You are already authenticated.");
      //   return;
      // }

      console.log("Authenticating with Dust...");
      await authenticate();
      console.log(
        "Authentication successful! Your credentials have been saved."
      );
    } catch (error) {
      console.error("Authentication failed:", error);
      process.exit(1);
    }
  });

program.parse(process.argv);
