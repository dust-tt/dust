import { Command } from "commander";

const program = new Command();

program.name("dust-mcp").description("Dust MCP CLI").version("1.0.0");

program
  .command("auth")
  .description("Authenticate with Dust")
  .action(async () => {
    try {
      console.log("Authenticating with Dust...");
      // TODO(kyllian): Implement authentication
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program.parse(process.argv);
