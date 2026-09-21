const colorNames = require("color-name");
const selectorParser = require("postcss-selector-parser");

const COLOR_PROPERTIES = new Set([
  "background-color",
  "color",
  "--tw-ring-color",
  "border-color",
  ...[
    "top",
    "right",
    "bottom",
    "left",
    "inline",
    "block",
    "inline-start",
    "inline-end",
    "block-start",
    "block-end",
  ].map((side) => `border-${side}-color`),
]);

function familyFor(selector) {
  const families = new Set();
  let explicitAlpha = false;
  selector.walkClasses(({ value }) => {
    const match = value.match(
      /(?:^|:)(bg|text|border|divide|placeholder|ring)-([a-z][a-z0-9-]*|\[[^\]]+\])(\/[^\s]+)?$/
    );
    if (match) {
      families.add(match[1]);
      explicitAlpha ||= Boolean(match[3]);
    }
  });
  if (families.size === 0) return undefined;
  return !explicitAlpha && families.size === 1 ? [...families][0] : null;
}

function inheritedFamily(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type !== "rule") continue;
    const family = familyFor(selectorParser().astSync(parent.selector));
    if (family !== undefined) return family;
  }
  return null;
}

function matchesProperty(family, property) {
  if (family === "bg") return property === "background-color";
  if (family === "text" || family === "placeholder")
    return property === "color";
  if (family === "ring") return property === "--tw-ring-color";
  return property.startsWith("border-") && property.endsWith("color");
}

function rgbChannels(value) {
  if (Object.hasOwn(colorNames, value)) return colorNames[value].join(" ");
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  return [0, 2, 4]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    .join(" ");
}

// Only opaque palette colors consumed V3's separate opacity variables. Semantic
// var(--background) colors, currentColor, inherit, and explicit slash alpha did not.
function withLegacyAlpha(value, variable, palette) {
  const channels = rgbChannels(value);
  if (channels) return `rgb(${channels} / var(${variable}, 1))`;
  const token = value.match(/^var\((--color-[\w-]+)\)$/)?.[1];
  if (token && rgbChannels(palette.get(token) ?? "")) {
    // Keep runtime theme overrides working instead of freezing the token's value.
    return `color-mix(in srgb, ${value} calc(var(${variable}, 1) * 100%), transparent)`;
  }
  return null;
}

function adaptDeclarations(container, family, palette) {
  const replacement = container.clone();
  const variable = `--viz-v3-${family}-opacity`;
  let changed = false;
  if (family) {
    for (const declaration of replacement.nodes) {
      if (
        declaration.type !== "decl" ||
        !matchesProperty(family, declaration.prop)
      )
        continue;
      const value = withLegacyAlpha(declaration.value, variable, palette);
      if (!value) continue;
      declaration.value = value;
      changed = true;
    }
  }
  if (changed)
    replacement.prepend({
      prop: variable,
      value: "1",
      source: container.source,
    });
  return replacement;
}

/**
 * @cc [owner:flvndvd,label:product] preserve-color-cascade
 * The adapter MUST preserve selector specificity, rule order, and explicit slash
 * alpha. Opaque color rules MUST reset legacy alpha so color variants override a
 * base opacity class. Rules without a legacy opacity class MUST retain their color.
 */
module.exports = () => ({
  postcssPlugin: "viz-tailwind-v3-compat",
  OnceExit(root) {
    let enabled = false;
    root.walkDecls("--viz-v3-compat", (marker) => {
      enabled = true;
      const parent = marker.parent;
      marker.remove();
      if (parent.nodes.length === 0) parent.remove();
    });
    if (!enabled) return;

    const palette = new Map();
    root.walkDecls(/^--color-/, ({ prop, value }) => palette.set(prop, value));
    root.walkRules((rule) => {
      const declarations = rule.nodes.filter(
        (node) => node.type === "decl" && COLOR_PROPERTIES.has(node.prop)
      );
      if (!declarations.length) return;
      if (
        !declarations.some(({ value }) =>
          withLegacyAlpha(value, "--probe", palette)
        )
      )
        return;

      const groups = new Map();
      for (const selector of selectorParser().astSync(rule.selector).nodes) {
        const ownFamily = familyFor(selector);
        const family =
          ownFamily === undefined && selector.toString().includes("&")
            ? inheritedFamily(rule)
            : (ownFamily ?? null);
        if (!groups.has(family)) groups.set(family, []);
        groups.get(family).push(selector.toString());
      }
      if (![...groups.keys()].some(Boolean)) return;

      // Tailwind's optimizer can merge .bg-red-500 and .bg-red-500/100. Split
      // that selector list before adapting only the class without explicit alpha.
      const replacements = [];
      for (const [family, selectors] of groups) {
        const replacement = adaptDeclarations(rule, family, palette);
        replacement.selector = selectors.join(",");
        replacements.push(replacement);
      }
      rule.replaceWith(...replacements);
    });
    // Development output can put declarations directly inside nested @media.
    root.walkAtRules((atRule) => {
      if (
        !atRule.nodes?.some(
          (node) => node.type === "decl" && COLOR_PROPERTIES.has(node.prop)
        )
      )
        return;
      const family = inheritedFamily(atRule);
      if (family)
        atRule.replaceWith(adaptDeclarations(atRule, family, palette));
    });
  },
});
module.exports.postcss = true;
