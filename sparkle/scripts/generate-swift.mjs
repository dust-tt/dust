#!/usr/bin/env node

/**
 * Generates Swift design tokens from Sparkle's tailwind.config.js.
 *
 * Usage: node sparkle/scripts/generate-swift.mjs
 *
 * Output: x/adrsimon/mobile/SparkleTokens/Sources/SparkleTokens/Generated/
 */

import { writeFileSync, mkdirSync, cpSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load tailwind config by evaluating it in a CJS subprocess.
// We can't require() it from ESM due to plugin CJS/ESM conflicts.
// The subprocess serializes just the data we need (colors, fontSize, extend.colors).
function loadTailwindConfig() {
  const sparkleDir = resolve(__dirname, "..");
  const configAbsPath = resolve(sparkleDir, "tailwind.config.js");
  const helperPath = resolve(__dirname, "_extract-config.cjs");
  writeFileSync(
    helperPath,
    `const Module = require('module');
const origResolve = Module._resolveFilename;
const origLoad = Module._load;
const stubs = new Set([
  '@tailwindcss/forms',
  'tailwind-scrollbar-hide',
  'tailwindcss-animate',
  '@tailwindcss/container-queries',
]);
Module._resolveFilename = function(r, p, i, o) {
  if (stubs.has(r)) return r;
  return origResolve.call(this, r, p, i, o);
};
Module._load = function(r, p, i) {
  if (stubs.has(r)) return function() {};
  if (r === 'tailwindcss/plugin') return function(fn) { return fn; };
  return origLoad.call(this, r, p, i);
};
const config = require(${JSON.stringify(configAbsPath)});
const data = {
  colors: config.colors,
  theme: {
    fontSize: config.theme.fontSize,
    extend: { colors: config.theme.extend.colors },
  },
};
process.stdout.write(JSON.stringify(data));
`
  );

  try {
    const result = execSync(`node "${helperPath}"`, {
      cwd: resolve(__dirname, ".."),
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(result);
  } finally {
    try { unlinkSync(helperPath); } catch {}
  }
}

const config = loadTailwindConfig();

const OUTPUT_DIR = resolve(
  __dirname,
  "../../x/adrsimon/mobile/SparkleTokens/Sources/SparkleTokens/Generated"
);
const LOGOS_XCASSETS_DIR = resolve(
  __dirname,
  "../../x/adrsimon/mobile/SparkleTokens/Sources/SparkleTokens/Resources/Logos.xcassets"
);
const LOGOS_SRC_DIR = resolve(__dirname, "../src/logo/src/dust");

const HEADER = `// DO NOT EDIT — Generated from Sparkle (tailwind.config.js)
// Run: cd sparkle && node scripts/generate-swift.mjs\n\n`;

// --- Helpers ---

function pxToNumber(px) {
  return parseFloat(String(px).replace("px", ""));
}

function toCamelCase(str) {
  let result = str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  // Swift identifiers can't start with a digit — prefix with underscore
  if (/^\d/.test(result)) result = "_" + result;
  return result;
}

function swiftFontWeight(weight) {
  const map = {
    400: ".regular",
    500: ".medium",
    600: ".semibold",
    700: ".bold",
  };
  return map[weight] || ".regular";
}

// Extract the custom colors object from the config (defined at top level, not in extend)
const customColors = config.colors;

// --- Colors ---

function normalizeHex(hex) {
  if (!hex) return hex;
  // Expand shorthand like "#fff" to "#FFFFFF"
  hex = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toUpperCase();
}

function resolveHex(value) {
  // value might be a string like "#111418" or an object like { DEFAULT: "#111418", night: "#F7F7F7" }
  if (typeof value === "string") return normalizeHex(value);
  if (typeof value === "object" && value.DEFAULT) return normalizeHex(value.DEFAULT);
  return null;
}

function resolveNightHex(palette, shade) {
  // Night mode rule: shade N maps to shade (1000 - N), capped at 950
  const nightShade = Math.min(950, 1000 - parseInt(shade));
  const nightValue = palette[nightShade];
  if (!nightValue) return null;
  return normalizeHex(typeof nightValue === "string" ? nightValue : nightValue.DEFAULT || nightValue);
}

function generateColors() {
  let lines = [];
  lines.push(HEADER);
  lines.push("import SwiftUI\n");
  lines.push("public extension Color {");

  // 1. Base palettes from customColors
  for (const [paletteName, shades] of Object.entries(customColors)) {
    lines.push(`\n    // MARK: - ${paletteName.charAt(0).toUpperCase() + paletteName.slice(1)} Palette`);
    for (const [shade, hex] of Object.entries(shades)) {
      const lightHex = resolveHex(hex);
      const darkHex = resolveNightHex(shades, shade);
      if (lightHex && darkHex) {
        lines.push(
          `    static let ${toCamelCase(paletteName)}${shade} = Color(light: "${lightHex}", dark: "${darkHex}")`
        );
      }
    }
  }

  // 2. Semantic colors from theme.extend.colors
  const semanticColors = config.theme.extend.colors;

  lines.push("\n    // MARK: - Semantic Colors");

  // background, foreground, border, separator, ring, muted, faint
  const simpleSemantics = {
    background: semanticColors.background,
    foreground: semanticColors.foreground,
    border: semanticColors.border,
    separator: semanticColors.separator,
    ring: semanticColors.ring,
    muted: semanticColors.muted,
    faint: semanticColors.faint,
  };

  for (const [name, value] of Object.entries(simpleSemantics)) {
    if (!value) continue;
    const light = resolveHex(value.DEFAULT || value);
    const dark = resolveHex(value.night || value);
    if (light && dark) {
      lines.push(
        `    static let dust${name.charAt(0).toUpperCase() + name.slice(1)} = Color(light: "${light}", dark: "${dark}")`
      );
    }
    // Nested variants (e.g., foreground.warning, border.dark, border.focus)
    for (const [subName, subValue] of Object.entries(value)) {
      if (subName === "DEFAULT" || subName === "night") continue;
      if (typeof subValue === "object" && subValue.DEFAULT) {
        const subLight = resolveHex(subValue.DEFAULT);
        const subDark = resolveHex(subValue.night || subValue.DEFAULT);
        lines.push(
          `    static let dust${name.charAt(0).toUpperCase() + name.slice(1)}${subName.charAt(0).toUpperCase() + subName.slice(1)} = Color(light: "${subLight}", dark: "${subDark}")`
        );
      }
    }
  }

  // Semantic palettes: primary, highlight, warning, success, info
  const semanticPalettes = ["primary", "highlight", "warning", "success", "info"];
  for (const paletteName of semanticPalettes) {
    const palette = semanticColors[paletteName];
    if (!palette) continue;

    lines.push(
      `\n    // MARK: - ${paletteName.charAt(0).toUpperCase() + paletteName.slice(1)} Semantic Palette`
    );

    // DEFAULT
    const defaultLight = resolveHex(palette.DEFAULT || palette);
    const defaultDark = resolveHex(palette.night || palette.DEFAULT || palette);
    if (defaultLight && defaultDark) {
      lines.push(
        `    static let ${paletteName} = Color(light: "${defaultLight}", dark: "${defaultDark}")`
      );
    }

    // light, dark, muted variants
    for (const variant of ["light", "dark", "muted"]) {
      const v = palette[variant];
      if (v && typeof v === "object" && v.DEFAULT) {
        const vLight = resolveHex(v.DEFAULT);
        const vDark = resolveHex(v.night || v.DEFAULT);
        lines.push(
          `    static let ${paletteName}${variant.charAt(0).toUpperCase() + variant.slice(1)} = Color(light: "${vLight}", dark: "${vDark}")`
        );
      }
    }

    // Numbered shades
    for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      const v = palette[shade];
      if (v && typeof v === "object" && v.DEFAULT) {
        const sLight = resolveHex(v.DEFAULT);
        const sDark = resolveHex(v.night || v.DEFAULT);
        lines.push(
          `    static let ${paletteName}${shade} = Color(light: "${sLight}", dark: "${sDark}")`
        );
      }
    }
  }

  // Brand colors
  const brand = semanticColors.brand;
  if (brand) {
    lines.push("\n    // MARK: - Brand Colors");
    for (const [name, hex] of Object.entries(brand)) {
      if (name === "DEFAULT") continue;
      const resolved = resolveHex(hex);
      if (resolved) {
        lines.push(
          `    static let brand${toCamelCase(name)
            .replace(/^./, (c) => c.toUpperCase())} = Color(light: "${resolved}", dark: "${resolved}")`
        );
      }
    }
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

// --- Typography ---

function generateTypography() {
  let lines = [];
  lines.push(HEADER);
  lines.push("import SwiftUI\n");

  // 1. Font size constants
  lines.push("/// Font size definitions matching Sparkle's typography scale.");
  lines.push("public enum SparkleFont {");

  const fontSizes = config.theme.fontSize;
  for (const [name, [size, options]] of Object.entries(fontSizes)) {
    const swiftName = toCamelCase(name);
    const sizeNum = pxToNumber(size);
    const lineHeight = pxToNumber(options.lineHeight);
    const tracking =
      options.letterSpacing === "normal" ? 0 : pxToNumber(options.letterSpacing);

    lines.push(`    /// ${size} / ${options.lineHeight} line-height / ${options.letterSpacing} tracking`);
    lines.push(`    public static let ${swiftName}Size: CGFloat = ${sizeNum}`);
    lines.push(`    public static let ${swiftName}LineHeight: CGFloat = ${lineHeight}`);
    lines.push(`    public static let ${swiftName}Tracking: CGFloat = ${tracking}`);
    lines.push("");
  }
  lines.push("}\n");

  // 2. Text style view modifiers
  lines.push("// MARK: - Text Style View Modifiers\n");
  lines.push("public extension View {\n");

  // Text styles extracted from the plugin section
  const textStyles = [
    // Labels
    { name: "labelXs", size: "xs", weight: 600, mono: false },
    { name: "labelSm", size: "sm", weight: 600, mono: false },
    { name: "labelBase", size: "base", weight: 600, mono: false },
    // Headings
    { name: "headingXs", size: "xs", weight: 600, mono: false },
    { name: "headingSm", size: "sm", weight: 600, mono: false },
    { name: "headingBase", size: "base", weight: 600, mono: false },
    { name: "headingLg", size: "lg", weight: 600, mono: false },
    { name: "headingXl", size: "xl", weight: 600, mono: false },
    { name: "heading2xl", size: "2xl", weight: 600, mono: false },
    { name: "heading3xl", size: "3xl", weight: 600, mono: false },
    { name: "heading4xl", size: "4xl", weight: 500, mono: false },
    { name: "heading5xl", size: "5xl", weight: 500, mono: false },
    { name: "heading6xl", size: "6xl", weight: 500, mono: false },
    { name: "heading7xl", size: "7xl", weight: 500, mono: false },
    { name: "heading8xl", size: "8xl", weight: 500, mono: false },
    { name: "heading9xl", size: "9xl", weight: 500, mono: false },
    // Mono headings
    { name: "headingMonoLg", size: "lg", weight: 400, mono: true },
    { name: "headingMonoXl", size: "xl", weight: 400, mono: true },
    { name: "headingMono2xl", size: "2xl", weight: 400, mono: true },
    { name: "headingMono3xl", size: "3xl", weight: 400, mono: true },
    { name: "headingMono4xl", size: "4xl", weight: 400, mono: true },
    { name: "headingMono5xl", size: "5xl", weight: 400, mono: true },
    { name: "headingMono6xl", size: "6xl", weight: 400, mono: true },
    { name: "headingMono7xl", size: "7xl", weight: 400, mono: true },
    { name: "headingMono8xl", size: "8xl", weight: 400, mono: true },
    { name: "headingMono9xl", size: "9xl", weight: 400, mono: true },
    // Copy
    { name: "copyXs", size: "xs", weight: 400, mono: false },
    { name: "copySm", size: "sm", weight: 400, mono: false },
    { name: "copyBase", size: "base", weight: 400, mono: false },
    { name: "copyLg", size: "lg", weight: 400, mono: false },
    { name: "copyXl", size: "xl", weight: 400, mono: false },
    { name: "copy2xl", size: "2xl", weight: 400, mono: false },
  ];

  for (const style of textStyles) {
    const sizeKey = toCamelCase(style.size);
    const fontName = style.mono ? "Geist Mono" : "Geist";
    const fontWeight = swiftFontWeight(style.weight);

    lines.push(`    /// Sparkle text style: s-${style.name.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
    lines.push(`    func sparkle${style.name.charAt(0).toUpperCase() + style.name.slice(1)}() -> some View {`);
    lines.push(`        self`);
    lines.push(`            .font(.custom("${fontName}", size: SparkleFont.${sizeKey}Size))`);
    lines.push(`            .fontWeight(${fontWeight})`);
    lines.push(`            .tracking(SparkleFont.${sizeKey}Tracking)`);
    lines.push(`    }\n`);
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

// --- Logos ---

function generateLogos() {
  // Copy Dust logo SVGs into xcassets
  const logoFiles = [
    { src: "Dust_Logo.svg", name: "DustLogo" },
    { src: "Dust_Logo_Mono.svg", name: "DustLogoMono" },
    { src: "Dust_Logo_MonoWhite.svg", name: "DustLogoMonoWhite" },
    { src: "Dust_Logo_White.svg", name: "DustLogoWhite" },
    { src: "Dust_Logo_Gray.svg", name: "DustLogoGray" },
    { src: "Dust_LogoSquare.svg", name: "DustLogoSquare" },
    { src: "Dust_LogoSquare_Mono.svg", name: "DustLogoSquareMono" },
    { src: "Dust_LogoSquare_MonoWhite.svg", name: "DustLogoSquareMonoWhite" },
    { src: "Dust_LogoSquare_White.svg", name: "DustLogoSquareWhite" },
    { src: "Dust_LogoSquare_Gray.svg", name: "DustLogoSquareGray" },
  ];

  // Root Contents.json
  mkdirSync(LOGOS_XCASSETS_DIR, { recursive: true });
  writeFileSync(
    resolve(LOGOS_XCASSETS_DIR, "Contents.json"),
    JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2)
  );

  for (const logo of logoFiles) {
    const srcPath = resolve(LOGOS_SRC_DIR, logo.src);
    if (!existsSync(srcPath)) {
      console.warn(`Warning: ${logo.src} not found, skipping`);
      continue;
    }

    const imagesetDir = resolve(LOGOS_XCASSETS_DIR, `${logo.name}.imageset`);
    mkdirSync(imagesetDir, { recursive: true });

    // Copy SVG
    cpSync(srcPath, resolve(imagesetDir, logo.src));

    // Write Contents.json
    writeFileSync(
      resolve(imagesetDir, "Contents.json"),
      JSON.stringify(
        {
          images: [{ filename: logo.src, idiom: "universal" }],
          info: { author: "xcode", version: 1 },
          properties: { "preserves-vector-representation": true },
        },
        null,
        2
      )
    );
  }

  // Generate DustLogo.swift for type-safe access
  let lines = [];
  lines.push(HEADER);
  lines.push("import SwiftUI\n");
  lines.push("/// Type-safe access to Dust logo variants bundled in SparkleTokens.");
  lines.push("public enum DustLogo: String, CaseIterable {");
  for (const logo of logoFiles) {
    const caseName =
      logo.name.charAt(0).toLowerCase() + logo.name.slice(1);
    lines.push(`    case ${caseName} = "${logo.name}"`);
  }
  lines.push("\n    public var image: Image {");
  lines.push('        Image(rawValue, bundle: .module)');
  lines.push("    }");
  lines.push("}");

  return { swift: lines.join("\n") + "\n", count: logoFiles.length };
}

// --- Main ---

mkdirSync(OUTPUT_DIR, { recursive: true });

console.log("Generating Colors.swift...");
writeFileSync(resolve(OUTPUT_DIR, "Colors.swift"), generateColors());

console.log("Generating Typography.swift...");
writeFileSync(resolve(OUTPUT_DIR, "Typography.swift"), generateTypography());

console.log("Generating Logos...");
const logoResult = generateLogos();
writeFileSync(resolve(OUTPUT_DIR, "DustLogo.swift"), logoResult.swift);

console.log(
  `Done! Generated tokens in ${OUTPUT_DIR}\n` +
    `  - Colors.swift\n` +
    `  - Typography.swift\n` +
    `  - DustLogo.swift (${logoResult.count} logo variants)\n` +
    `  - Logos.xcassets (${logoResult.count} image sets)`
);
