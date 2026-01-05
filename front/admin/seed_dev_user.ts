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
  getContext?: (type: string) => object;
};

type DocumentStub = {
  createElement: (tag: string) => ElementStub;
  getElementsByTagName: (tag: string) => ElementStub[];
  createTextNode: (text: string) => { textContent: string };
  head?: ElementStub;
};

function createCanvasContext(): Record<string, unknown> {
  const noop = () => undefined;
  return new Proxy<Record<string, unknown>>(
    {},
    {
      get: (_target, prop) => {
        if (prop === "canvas") {
          return { width: 1, height: 1 };
        }
        return noop;
      },
    }
  );
}

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
      createElement: (tag: string) =>
        tag === "canvas"
          ? {
              ...elementStub,
              getContext: () => createCanvasContext(),
            }
          : { ...elementStub },
      getElementsByTagName: () => [{ ...elementStub }],
      createTextNode: (text: string) => ({ textContent: text }),
    };
    documentStub.head = { ...elementStub };
    Reflect.set(globalThis, "document", documentStub);
  }

  const documentValue = Reflect.get(globalThis, "document");
  if (isDocumentStub(documentValue)) {
    if (typeof documentValue.createTextNode !== "function") {
      documentValue.createTextNode = (text: string) => ({ textContent: text });
    }
    if (!documentValue.head) {
      documentValue.head = {
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
      };
    }
  }

  if (!("window" in globalThis)) {
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

  const navigatorValue = Reflect.get(globalThis, "navigator");
  if (typeof windowValue === "object" && windowValue !== null) {
    if (typeof Reflect.get(windowValue, "navigator") === "undefined") {
      Reflect.set(windowValue, "navigator", navigatorValue);
    }
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
