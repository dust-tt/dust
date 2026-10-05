#!/usr/bin/env node

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(MOBILE_DIR, "../../..");
const SPARKLE_DIR = resolve(REPO_DIR, "sparkle");
const TOKENS_DIR = resolve(MOBILE_DIR, "SparkleTokens/Sources/SparkleTokens");
const OUTPUT_DIR = resolve(TOKENS_DIR, "Generated");
const ICONS_XCASSETS_DIR = resolve(TOKENS_DIR, "Resources/Icons.xcassets");
const LOGOS_XCASSETS_DIR = resolve(TOKENS_DIR, "Resources/Logos.xcassets");

const TOKENS_CSS = resolve(SPARKLE_DIR, "src/styles/tokens.css");
const THEME_CSS = resolve(SPARKLE_DIR, "src/styles/theme.css");
const ICONS_SRC_DIR = resolve(SPARKLE_DIR, "src/icons/src/v2-stroke");
const ACTION_ICONS_TS = resolve(SPARKLE_DIR, "src/icons/ActionIcons.ts");
const DUST_LOGOS_SRC_DIR = resolve(SPARKLE_DIR, "src/logo/src/dust");
const PLATFORM_LOGOS_SRC_DIR = resolve(SPARKLE_DIR, "src/logo/src/platforms");
const MCP_SERVERS_DIR = resolve(REPO_DIR, "front/lib/api/actions/servers");
const FRONT_RESOURCE_ICONS_TSX = resolve(REPO_DIR, "front/components/resources/resources_icons.tsx");

const HEADER = `// DO NOT EDIT — Generated from Sparkle (sparkle/src/styles, sparkle/src/icons, sparkle/src/logo)
// Run: make tokens\n\n`;

const MOBILE_FONT_SCALE = 1.21;
const SEMANTIC_PALETTES = ["primary", "highlight", "success", "warning", "info"];
const DUST_LOGOS = [
  "Dust_Logo",
  "Dust_Logo_Mono",
  "Dust_Logo_MonoWhite",
  "Dust_Logo_White",
  "Dust_Logo_Gray",
  "Dust_LogoSquare",
  "Dust_LogoSquare_Mono",
  "Dust_LogoSquare_MonoWhite",
  "Dust_LogoSquare_White",
  "Dust_LogoSquare_Gray",
];

const camelCase = (str) => {
  const result = str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  return /^\d/.test(result) ? `_${result}` : result;
};
const pascalCase = (str) => camelCase(str).replace(/^./, (c) => c.toUpperCase());
const lowerFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);
const svgFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith(".svg")).sort();


function parseBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, " ").trim()])
  );
}

function resolveValue(value, scopes) {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (!ref) return value;
  const next = scopes.map((scope) => scope[ref[1]]).find((v) => v !== undefined);
  if (next === undefined) throw new Error(`Unresolved CSS variable --${ref[1]}`);
  return resolveValue(next, scopes);
}


function oklchToRgb(l, c, h) {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
  return linear.map((x) => {
    const gamma = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, gamma)) * 255);
  });
}

function toHex(value) {
  const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  const oklch = value.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/);
  if (oklch) {
    return `#${oklchToRgb(oklch[1] / 100, Number(oklch[2]), Number(oklch[3])).map(hex).join("")}`;
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) {
    return `#${[rgba[1], rgba[2], rgba[3]].map((n) => hex(Number(n))).join("")}${hex(Math.round(rgba[4] * 255))}`;
  }
  throw new Error(`Unsupported color value: ${value}`);
}


function colorGroup(name) {
  if (SEMANTIC_PALETTES.some((p) => name === p || name.startsWith(`${p}-`))) return "semantic";
  if (name === "brand" || name.startsWith("brand-")) return "brand";
  if (/^[a-z]+-\d+$/.test(name)) return "primitive";
  return "structural";
}

function swiftColorName(name, group) {
  return group === "structural" ? `dust${pascalCase(name)}` : camelCase(name);
}

function generateColors() {
  const css = readFileSync(TOKENS_CSS, "utf-8");
  const light = parseBlock(css, ":root");
  const dark = parseBlock(css, ".dark");
  const names = Object.keys(light).filter((k) => k.startsWith("color-")).map((k) => k.slice(6));

  const sections = [
    ["primitive", "Primitive Palettes"],
    ["semantic", "Semantic Palettes"],
    ["structural", "Structural & Surfaces"],
    ["brand", "Brand"],
  ];

  const lines = [HEADER, "import SwiftUI\n", "public extension Color {"];
  for (const [group, title] of sections) {
    lines.push(`\n    // MARK: - ${title}`);
    for (const name of names.filter((n) => colorGroup(n) === group)) {
      const key = `color-${name}`;
      const lightHex = toHex(resolveValue(light[key], [light]));
      const darkHex = toHex(resolveValue(dark[key] ?? light[key], [dark, light]));
      lines.push(
        `    static let ${swiftColorName(name, group)} = Color(light: "${lightHex}", dark: "${darkHex}")`
      );
    }
  }
  lines.push("}");
  return { swift: `${lines.join("\n")}\n`, count: names.length };
}


function fontWeight(weight) {
  if (weight < 450) return ".regular";
  if (weight < 550) return ".medium";
  return ".semibold";
}

function generateTypography() {
  const css = readFileSync(THEME_CSS, "utf-8");
  const theme = {};
  for (const [, name, value] of css.matchAll(/--(text-[\w-]+):\s*([^;]+);/g)) theme[name] ??= value.trim();
  const sizes = Object.keys(theme)
    .filter((k) => /^text-[\w]+$/.test(k))
    .map((k) => k.slice(5));
  const sizeOf = (size) => Math.round(parseFloat(theme[`text-${size}`]) * MOBILE_FONT_SCALE);
  const trackingOf = (size, raw) => {
    const value = resolveValue(raw, [theme]);
    return value === "0" || value === "normal" ? 0 : +(parseFloat(value) * sizeOf(size)).toFixed(3);
  };

  const lines = [HEADER, "import SwiftUI\n", "public enum SparkleFont {"];
  for (const size of sizes) {
    const name = camelCase(size);
    lines.push(`    public static let ${name}Size: CGFloat = ${sizeOf(size)}`);
    lines.push(
      `    public static let ${name}LineHeight: CGFloat = ${Math.round(sizeOf(size) * parseFloat(theme[`text-${size}--line-height`]))}`
    );
    lines.push(`    public static let ${name}Tracking: CGFloat = ${trackingOf(size, theme[`text-${size}--letter-spacing`])}`);
    lines.push("");
  }
  lines.push("}\n", "public extension View {");

  for (const [, utility, body] of css.matchAll(/@utility ((?:label|heading|copy)-[\w-]+) \{([^}]*)\}/g)) {
    const size = body.match(/font-size:\s*var\(--text-([\w]+)\)/)[1];
    const weight = Number(body.match(/font-weight:\s*(\d+)/)[1]);
    const font = /font-family:\s*var\(--font-mono\)/.test(body) ? "Geist Mono" : "Geist";
    const tracking = trackingOf(size, body.match(/letter-spacing:\s*([^;]+);/)[1].trim());
    lines.push(`\n    func sparkle${pascalCase(utility)}() -> some View {`);
    lines.push(`        font(.custom("${font}", size: SparkleFont.${camelCase(size)}Size))`);
    lines.push(`            .fontWeight(${fontWeight(weight)})`);
    lines.push(`            .tracking(${tracking})`);
    lines.push("    }");
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}


function resetCatalog(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2));
}

function writeImageset(catalogDir, name, srcPath, fileName, renderingIntent) {
  const dir = resolve(catalogDir, `${name}.imageset`);
  mkdirSync(dir, { recursive: true });
  cpSync(srcPath, resolve(dir, fileName));
  const properties = { "preserves-vector-representation": true };
  if (renderingIntent) properties["template-rendering-intent"] = renderingIntent;
  writeFileSync(
    resolve(dir, "Contents.json"),
    JSON.stringify({ images: [{ filename: fileName, idiom: "universal" }], info: { author: "xcode", version: 1 }, properties }, null, 2)
  );
}

function swiftEnum(name, doc, assetNames) {
  const lines = [HEADER, "import SwiftUI\n", `/// ${doc}`, `public enum ${name}: String, CaseIterable {`];
  for (const asset of assetNames) lines.push(`    case ${lowerFirst(asset)} = "${asset}"`);
  lines.push("\n    public var image: Image {", "        Image(rawValue, bundle: .module)", "    }", "}");
  return `${lines.join("\n")}\n`;
}

function generateLogos() {
  resetCatalog(LOGOS_XCASSETS_DIR);
  const names = DUST_LOGOS.map((file) => {
    const name = file.replace(/_/g, "");
    writeImageset(LOGOS_XCASSETS_DIR, name, resolve(DUST_LOGOS_SRC_DIR, `${file}.svg`), `${file}.svg`);
    return name;
  });
  return { swift: swiftEnum("DustLogo", "Dust logo variants bundled in SparkleTokens.", names), count: names.length };
}

function generateIcons() {
  resetCatalog(ICONS_XCASSETS_DIR);
  const icons = [
    ...svgFiles(ICONS_SRC_DIR).map((file) => ({ file, dir: ICONS_SRC_DIR, name: pascalCase(file.replace(/\.svg$/, "")), intent: "template" })),
    ...svgFiles(PLATFORM_LOGOS_SRC_DIR).map((file) => ({ file, dir: PLATFORM_LOGOS_SRC_DIR, name: `${pascalCase(file.replace(/\.svg$/, ""))}Logo`, intent: "original" })),
  ];
  for (const icon of icons) writeImageset(ICONS_XCASSETS_DIR, icon.name, resolve(icon.dir, icon.file), icon.file, icon.intent);
  const names = icons.map((i) => i.name);
  return { swift: swiftEnum("SparkleIcon", "Sparkle icons bundled in SparkleTokens.", names), names };
}


function iconAliases() {
  const aliases = new Map();
  for (const file of [ACTION_ICONS_TS, FRONT_RESOURCE_ICONS_TSX]) {
    for (const [, alias, component] of readFileSync(file, "utf-8").matchAll(/^\s*(\w+Icon): (\w+),$/gm)) {
      aliases.set(alias, component);
    }
  }
  return aliases;
}

function generateMCPServerIcons(iconNames) {
  const cases = new Map(iconNames.map((name) => [name.toLowerCase(), lowerFirst(name)]));
  const aliases = iconAliases();
  const byIcon = new Map();
  let count = 0;

  for (const entry of readdirSync(MCP_SERVERS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const serverDir = resolve(MCP_SERVERS_DIR, entry.name);
    for (const file of readdirSync(serverDir).filter((f) => f.endsWith("metadata.ts"))) {
      const iconName = readFileSync(resolve(serverDir, file), "utf-8").match(/icon:\s*"([^"]+)"/)?.[1];
      if (!iconName) continue;
      const swiftCase = cases.get((aliases.get(iconName) ?? iconName).toLowerCase());
      if (!swiftCase) {
        console.warn(`  Warning: icon "${iconName}" has no SparkleIcon, skipping ${entry.name}/${file}`);
        continue;
      }
      const prefix = file.replace(/_?metadata\.ts$/, "");
      const serverName = prefix ? `${entry.name}_${prefix}` : entry.name;
      byIcon.set(swiftCase, [...(byIcon.get(swiftCase) ?? []), serverName]);
      count++;
    }
  }

  const lines = [
    HEADER,
    "import SwiftUI\n",
    "/// Maps internal MCP server names to their SparkleIcon (front/lib/api/actions/servers/*/metadata.ts).",
    "public enum MCPServerIcon {",
    "    public static func icon(for serverName: String) -> SparkleIcon? {",
    "        switch serverName {",
  ];
  for (const [swiftCase, servers] of [...byIcon].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`        case ${servers.sort().map((s) => `"${s}"`).join(", ")}: .${swiftCase}`);
  }
  lines.push("        default: nil", "        }", "    }", "}");
  return { swift: `${lines.join("\n")}\n`, count };
}


mkdirSync(OUTPUT_DIR, { recursive: true });
const colors = generateColors();
writeFileSync(resolve(OUTPUT_DIR, "Colors.swift"), colors.swift);
writeFileSync(resolve(OUTPUT_DIR, "Typography.swift"), generateTypography());
const logos = generateLogos();
writeFileSync(resolve(OUTPUT_DIR, "DustLogo.swift"), logos.swift);
const icons = generateIcons();
writeFileSync(resolve(OUTPUT_DIR, "SparkleIcon.swift"), icons.swift);
const mcp = generateMCPServerIcons(icons.names);
writeFileSync(resolve(OUTPUT_DIR, "MCPServerIcon.swift"), mcp.swift);

console.log(
  `Generated ${colors.count} colors, ${logos.count} logos, ${icons.names.length} icons, ${mcp.count} MCP server icons in ${OUTPUT_DIR}`
);
