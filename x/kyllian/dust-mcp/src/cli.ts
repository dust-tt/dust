import { Command } from "commander";
import { login, logout, isLoggedIn } from "./auth.js";

const program = new Command();

program.name("dust-mcp").description("Dust MCP CLI").version("1.0.0");

const auth = program.command("auth").description("Authenticate with Dust");

const loginAction = async () => {
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
};

const logoutAction = async () => {
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
};

auth
  .command("login")
  .description("log in to a Dust account")
  .action(loginAction);

auth
  .command("logout")
  .description("log out of a Dust account")
  .action(logoutAction);

auth
  .command("switch")
  .description("switch active Dust account")
  .action(async () => {
    await logoutAction();
    await loginAction();
  });

program.parse(process.argv);
