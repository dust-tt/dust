import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SparkleTokenRegistry } from "../types.js";

const TOKENS_FILENAME = "sparkle-tokens.json";
const MAX_UPWARD_WALK = 6;

/**
 * Walks up from this module's directory looking for `sparkle-tokens.json`.
 * Works in both layouts: dev (`scanner/src/tokens/registry.ts`, tokens at
 * `sparklytics/sparkle-tokens.json`, 3 levels up) and built (`scanner/dist/
 * index.js`, tokens 2 levels up).
 */
function resolveDefaultTokensPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < MAX_UPWARD_WALK; i++) {
    const candidate = path.join(dir, TOKENS_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate default ${TOKENS_FILENAME}. Pass --tokens <path> to specify a custom registry.`
  );
}

let _registry: SparkleTokenRegistry | null = null;

export function loadRegistry(customPath: string | null): SparkleTokenRegistry {
  if (_registry) return _registry;

  const tokensPath = customPath ?? resolveDefaultTokensPath();

  if (!fs.existsSync(tokensPath)) {
    throw new Error(`Sparkle tokens file not found at: ${tokensPath}`);
  }

  try {
    _registry = JSON.parse(
      fs.readFileSync(tokensPath, "utf-8")
    ) as SparkleTokenRegistry;
    return _registry;
  } catch (e) {
    throw new Error(
      `Failed to parse sparkle tokens file at ${tokensPath}: ${e}`
    );
  }
}

/** Returns a Set of all known hex values (lowercase) for fast lookup */
export function getColorHexSet(registry: SparkleTokenRegistry): Set<string> {
  return new Set(Object.values(registry.colors).map((c) => c.toLowerCase()));
}

/** Returns a Set of spacing values for fast lookup */
export function getSpacingSet(registry: SparkleTokenRegistry): Set<string> {
  return new Set(registry.spacingScale);
}

/** Returns a Set of font sizes for fast lookup */
export function getFontSizeSet(registry: SparkleTokenRegistry): Set<string> {
  return new Set(registry.fontSizes);
}

/** Returns a Set of line heights for fast lookup */
export function getLineHeightSet(registry: SparkleTokenRegistry): Set<string> {
  return new Set(registry.lineHeights);
}
