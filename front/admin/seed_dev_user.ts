#!/usr/bin/env npx tsx
/**
 * Seeds a development database with a user, workspace, and subscription.
 *
 * Usage:
 *   npx tsx admin/seed_dev_user.ts <config.json>
 *
 * The config.json file should contain:
 *   {
 *     "email": "you@example.com",
 *     "name": "Your Name",
 *     "firstName": "Your",
 *     "workspaceName": "My Dev Workspace",
 *     // Optional fields:
 *     "sId": "user-sid",           // Auto-generated if not provided
 *     "username": "yourname",       // Derived from email if not provided
 *     "lastName": "Name",
 *     "workOSUserId": "workos-id",  // For SSO login support
 *     "provider": "google",
 *     "providerId": "google-id",
 *     "imageUrl": "https://..."
 *   }
 *
 * SAFETY: Only runs when NODE_ENV=development.
 */

import * as fs from "fs";

import { seedDevUser, validateSeedConfig } from "@app/lib/seed_dev_user";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `This script can only run in development. Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx admin/seed_dev_user.ts <config.json>");
    console.error("");
    console.error("Config file format:");
    console.error(
      '  { "email": "...", "name": "...", "firstName": "...", "workspaceName": "..." }'
    );
    process.exit(1);
  }

  console.log("Seeding dev database...");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, "utf-8");
  const config: unknown = JSON.parse(configContent);

  if (!validateSeedConfig(config)) {
    throw new Error(
      "Config must include: email, name, firstName, workspaceName"
    );
  }

  await seedDevUser(config);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
