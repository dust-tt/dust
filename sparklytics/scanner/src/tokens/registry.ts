import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SparkleTokenRegistry } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the bundled default tokens.
// In dev (src/tokens/registry.ts): __dirname = scanner/src/tokens/ → ../../.. = sparklytics/
// In build (dist/index.js, bundled):  __dirname = scanner/dist/    → ../..    = sparklytics/
// We resolve relative to the scanner package root first, then up one to sparklytics/.
const SCANNER_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_TOKENS_PATH = path.resolve(SCANNER_ROOT, "sparkle-tokens.json");

let _registry: SparkleTokenRegistry | null = null;

export function loadRegistry(customPath: string | null): SparkleTokenRegistry {
  if (_registry) return _registry;

  const tokensPath = customPath ?? DEFAULT_TOKENS_PATH;

  if (!fs.existsSync(tokensPath)) {
    throw new Error(
      `Sparkle tokens file not found at: ${tokensPath}\n` +
        "Run `sparkle-scan` from the sparklytics directory or provide --tokens <path>."
    );
  }

  try {
    _registry = JSON.parse(
      fs.readFileSync(tokensPath, "utf-8")
    ) as SparkleTokenRegistry;
    return _registry;
  } catch (e) {
    throw new Error(`Failed to parse sparkle tokens file at ${tokensPath}: ${e}`);
  }
}

export function resetRegistry(): void {
  _registry = null;
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
