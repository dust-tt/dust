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
 * SAFETY: Only runs in development mode (enforced by seedDevUser).
 */

import * as fs from "fs";

type ElementStub = {
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  appendChild: (node: unknown) => void;
};

type DocumentStub = {
  createElement: (tag: string) => ElementStub;
  getElementsByTagName: (tag: string) => ElementStub[];
};

function isDocumentStub(value: unknown): value is DocumentStub {
  return (
    typeof value === "object" &&
    value !== null &&
    "createElement" in value &&
    "getElementsByTagName" in value
  );
}

function ensureDomStubs(): void {
  if (!("document" in globalThis)) {
    const elementStub: ElementStub = {
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
    };
    const documentStub: DocumentStub = {
      createElement: () => ({ ...elementStub }),
      getElementsByTagName: () => [{ ...elementStub }],
    };
    Reflect.set(globalThis, "document", documentStub);
  }

  if (!("window" in globalThis)) {
    const documentValue = Reflect.get(globalThis, "document");
    if (isDocumentStub(documentValue)) {
      Reflect.set(globalThis, "window", {
        document: documentValue,
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { href: "http://localhost" },
      });
    }
  }

  const windowValue = Reflect.get(globalThis, "window");
  if (typeof windowValue === "object" && windowValue !== null) {
    if (typeof Reflect.get(windowValue, "addEventListener") !== "function") {
      Reflect.set(windowValue, "addEventListener", () => {});
    }
    if (typeof Reflect.get(windowValue, "removeEventListener") !== "function") {
      Reflect.set(windowValue, "removeEventListener", () => {});
    }
    if (typeof Reflect.get(windowValue, "location") !== "object") {
      Reflect.set(windowValue, "location", { href: "http://localhost" });
    }
  }

  if (!("navigator" in globalThis)) {
    Reflect.set(globalThis, "navigator", { userAgent: "node" });
  }
}

async function main() {
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

  ensureDomStubs();
  const { parseSeedConfig, seedDevUser } = await import("@app/lib/dev/dev_seed_user");

  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = parseSeedConfig(JSON.parse(configContent));

  await seedDevUser(config);
  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
