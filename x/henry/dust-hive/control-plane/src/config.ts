import { homedir } from "node:os";
import { join } from "node:path";
import type { Identity } from "./auth";

// Centralized, typed access to environment configuration — the rest of the
// code never touches process.env directly.

export type ProviderKind = "fake" | "blaxel";

export interface Config {
  port: number;
  region: string;
  beesFilePath: string;
  // "fake" (default) runs against the in-memory provider; "blaxel" provisions
  // real sandboxes (requires BL_API_KEY / BL_WORKSPACE in the environment).
  provider: ProviderKind;
  beeImage: string;
  beeMemoryMb: number;
  // Where the dust repo is baked in the bee image; bee-init/warm run here.
  beeRepoPath: string;
  // Dev-only static token→identity map (see StaticTokenVerifier). Empty in a
  // real deployment, where a WorkOS/OIDC verifier is injected instead.
  devTokens: ReadonlyMap<string, Identity>;
}

// Parse "tokenA=userA,tokenB=userB" into a token→identity map.
function parseDevTokens(raw: string | undefined): Map<string, Identity> {
  const map = new Map<string, Identity>();
  if (!raw) {
    return map;
  }
  for (const pair of raw.split(",")) {
    const [token, userId] = pair.split("=");
    if (token && userId) {
      map.set(token.trim(), { id: userId.trim() });
    }
  }
  return map;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env["HIVE_CP_PORT"] ?? "4000"),
    region: env["HIVE_CP_REGION"] ?? "eu",
    beesFilePath:
      env["HIVE_CP_BEES_FILE"] ?? join(homedir(), ".dust-hive", "control-plane", "bees.json"),
    provider: env["HIVE_CP_PROVIDER"] === "blaxel" ? "blaxel" : "fake",
    beeImage: env["HIVE_CP_BEE_IMAGE"] ?? "",
    beeMemoryMb: Number(env["HIVE_CP_BEE_MEMORY_MB"] ?? "16384"),
    beeRepoPath: env["HIVE_CP_BEE_REPO_PATH"] ?? "/workspace/dust",
    devTokens: parseDevTokens(env["HIVE_CP_DEV_TOKENS"]),
  };
}
