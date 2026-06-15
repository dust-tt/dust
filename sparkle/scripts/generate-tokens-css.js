#!/usr/bin/env node
/**
 * One-time script: reads tailwind-preset.js color definitions and outputs
 * src/styles/tokens.css with :root (light) and .dark (dark) CSS custom properties.
 *
 * Usage: node scripts/generate-tokens-css.js
 *
 * After running, the generated tokens.css becomes the source of truth for colors.
 * This script can be deleted once the migration is complete.
 */

const path = require("path");
const fs = require("fs");

// Load the preset to access its color definitions
const preset = require("../tailwind-preset.js");
const colors = preset.theme.extend.colors;

// Only process colors we explicitly define — skip built-in tailwindcss/colors
// that leak in from `require("tailwindcss/colors")`.
const OUR_PALETTE_COLORS = new Set([
  "gray",
  "stone",
  "golden",
  "blue",
  "green",
  "rose",
  "violet",
  "red",
  "orange",
  "lime",
  "emerald",
  "pink",
]);

// Semantic token groups (everything that isn't a raw palette color)
const SEMANTIC_TOKENS = new Set([
  "border",
  "separator",
  "ring",
  "background",
  "app-background",
  "panel",
  "foreground",
  "hover",
  "muted",
  "faint",
  "primary",
  "highlight",
  "warning",
  "success",
  "sidebar",
  "info",
  "brand",
]);

const lightVars = [];
const darkVars = [];

/**
 * Recursively walk a color object and emit CSS custom property pairs.
 */
function walk(obj, prefix, isPalette) {
  if (typeof obj === "string") {
    lightVars.push([`--color-${prefix}`, obj]);
    return;
  }

  if (typeof obj !== "object" || obj === null) {
    return;
  }

  const keys = Object.keys(obj);

  // { DEFAULT, night } leaf node → emit light/dark pair
  if (keys.includes("DEFAULT") && keys.includes("night")) {
    const defaultVal = obj.DEFAULT;
    const nightVal = obj.night;

    if (typeof defaultVal === "string" && typeof nightVal === "string") {
      lightVars.push([`--color-${prefix}`, defaultVal]);
      darkVars.push([`--color-${prefix}`, nightVal]);
    }

    // Continue walking sub-keys (excluding DEFAULT, night, and *-night)
    for (const key of keys) {
      if (key === "DEFAULT" || key === "night") continue;
      if (key.endsWith("-night")) continue;
      const child = obj[key];
      walk(child, `${prefix}-${key}`, isPalette);
    }
    return;
  }

  // For palette colors: emit shade values AND their auto-inverted dark counterparts
  if (isPalette) {
    const shades = {};
    const nightShades = {};
    for (const key of keys) {
      if (key.endsWith("-night")) {
        const baseShade = key.replace("-night", "");
        nightShades[baseShade] = obj[key];
      } else if (typeof obj[key] === "string") {
        shades[key] = obj[key];
      }
    }

    for (const [shade, value] of Object.entries(shades)) {
      lightVars.push([`--color-${prefix}-${shade}`, value]);
    }

    for (const [shade, nightValue] of Object.entries(nightShades)) {
      if (typeof nightValue === "string") {
        darkVars.push([`--color-${prefix}-${shade}`, nightValue]);
      }
    }

    // Walk sub-objects (e.g., golden shades with DEFAULT/night)
    for (const key of keys) {
      if (key.endsWith("-night")) continue;
      if (typeof obj[key] !== "string") {
        walk(obj[key], `${prefix}-${key}`, isPalette);
      }
    }
    return;
  }

  // Semantic object — handle DEFAULT without night, and recurse children
  if (keys.includes("DEFAULT")) {
    const defaultVal = obj.DEFAULT;
    if (typeof defaultVal === "string") {
      // DEFAULT without night → light-only value
      lightVars.push([`--color-${prefix}`, defaultVal]);
    }
  }

  for (const key of keys) {
    if (key === "DEFAULT") continue;
    if (key.endsWith("-night")) continue;
    const child = obj[key];
    const childPrefix = `${prefix}-${key}`;
    walk(child, childPrefix, isPalette);
  }
}

// Process only our colors and semantic tokens
for (const [name, value] of Object.entries(colors)) {
  if (OUR_PALETTE_COLORS.has(name)) {
    walk(value, name, true);
  } else if (SEMANTIC_TOKENS.has(name)) {
    walk(value, name, false);
  }
}

// Sort for readability: semantic tokens first, then palette
function sortKey(varName) {
  const base = varName.replace("--color-", "").split("-")[0];
  const isSemantic =
    SEMANTIC_TOKENS.has(base) || ["app", "panel"].includes(base);
  return `${isSemantic ? "0" : "1"}-${varName}`;
}

lightVars.sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])));
darkVars.sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])));

// Build CSS output
function formatBlock(vars, indent = "  ") {
  return vars.map(([prop, val]) => `${indent}${prop}: ${val};`).join("\n");
}

const css = `/* ==========================================================================
 * Design tokens — generated from tailwind-preset.js
 *
 * This file is the SOURCE OF TRUTH for all color tokens.
 * Light values live in :root, dark overrides in .dark.
 * Components use semantic classes (e.g. s:text-foreground) — no dark: prefix needed.
 * ========================================================================== */

:root {
${formatBlock(lightVars)}
}

.dark {
${formatBlock(darkVars)}
}
`;

const outPath = path.join(__dirname, "..", "src", "styles", "tokens.css");
fs.writeFileSync(outPath, css, "utf-8");

console.log(
  `✓ Generated ${lightVars.length} light vars, ${darkVars.length} dark vars`
);
console.log(`✓ Written to ${outPath}`);
