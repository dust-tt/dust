#!/usr/bin/env node

import { Command } from "commander";
import { getDustAPI } from "./api.js";
import { isLoggedIn, login, logout } from "./auth.js";
import { startServer } from "./server.js";

const loginAction = async (quiet = false) => {
  try {
    const isUserLoggedIn = await isLoggedIn();
    if (isUserLoggedIn) {
      if (!quiet) console.log("You are already logged in.");
      return;
    }

    if (!quiet) console.log("Logging in to Dust...");
    await login();
    if (!quiet)
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

const statusAction = async () => {
  try {
    const isUserLoggedIn = await isLoggedIn();
    if (!isUserLoggedIn) {
      console.log("You are not currently logged in.");
      return;
    }

    const { dustAPI, dustConfig } = await getDustAPI();
    const userRes = await dustAPI.me();

    if (!userRes.isOk()) {
      console.error("Failed to get user information:", userRes.error.message);
      process.exit(1);
    }

    const user = userRes.value;
    const currentWorkspace = user.workspaces.find(
      (w) => w.sId === dustConfig.workspaceId
    );

    console.log("Currently logged in as:");
    console.log(`  ${user.fullName} <${user.email}>`);

    if (!currentWorkspace) {
      console.error("Failed to find current workspace in user workspaces");
      process.exit(1);
    }

    console.log(
      `  - Workspace: ${currentWorkspace.name} [${currentWorkspace.sId}]`
    );
  } catch (error) {
    console.error("Failed to get status:", error);
    process.exit(1);
  }
};

const switchAction = async () => {
  await logoutAction();
  await loginAction();
};

const serverAction = async () => {
  await loginAction(true);

  try {
    await startServer();
  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
};

async function main() {
  const program = new Command();

  program.name("dust-mcp").description("Dust MCP CLI").version("1.0.0");

  const auth = program.command("auth").description("Authenticate with Dust");

  auth
    .command("login")
    .description("log in to a Dust account")
    .action(loginAction);

  auth
    .command("logout")
    .description("log out of a Dust account")
    .action(logoutAction);

  auth
    .command("status")
    .description("display active Dust account")
    .action(statusAction);

  auth
    .command("switch")
    .description("switch active Dust account")
    .action(switchAction);

  program
    .command("server")
    .description("start the Dust MCP server")
    .action(serverAction);

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
