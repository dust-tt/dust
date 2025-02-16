import { Command } from "commander";
import { login, logout, isLoggedIn } from "./auth.js";

const program = new Command();

program.name("dust-mcp").description("Dust MCP CLI").version("1.0.0");

const auth = program
  .command("auth")
  .description("authentication related commands");

auth
  .command("login")
  .description("login to Dust")
  .action(async () => {
    try {
      const isUserLoggedIn = await isLoggedIn();
      if (isUserLoggedIn) {
        console.log("You are already logged in.");
        return;
      }

      console.log("Logging in to Dust...");
      await login();
      console.log("Login successful! Your credentials have been saved.");
    } catch (error) {
      console.error("Login failed:", error);
      process.exit(1);
    }
  });

auth
  .command("logout")
  .description("logout from Dust")
  .action(async () => {
    try {
      const isUserLoggedIn = await isLoggedIn();
      if (!isUserLoggedIn) {
        console.log("You are not currently logged in.");
        return;
      }

      await logout();
      console.log("Successfully logged out.");
    } catch (error) {
      console.error("Logout failed:", error);
      process.exit(1);
    }
  });

program.parse(process.argv);
