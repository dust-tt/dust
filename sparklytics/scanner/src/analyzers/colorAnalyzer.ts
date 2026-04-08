import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { TSESTree } from "@typescript-eslint/types";
import type { Root, Declaration } from "postcss";
import type { ParseCache } from "../parsers/tsxParser.js";
import { parseCssFile } from "../parsers/cssParser.js";
import { traverseAST } from "../parsers/astUtils.js";
import { relativePath } from "../utils/fileCollector.js";
import type { ColorAnalysis, ScanConfig, SparkleTokenRegistry, TokenViolation } from "../types.js";
import { getColorHexSet } from "../tokens/registry.js";

// ─── Color Patterns ───────────────────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\s*\(/i;
const HSL_RE = /^hsla?\s*\(/i;
const CSS_VAR_RE = /^var\s*\(--/i;

// Common CSS named colors (subset of the 140+ named colors)
const NAMED_CSS_COLORS = new Set([
  "aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black",
  "blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse",
  "chocolate","coral","cornflowerblue","cornsilk","crimson","cyan","darkblue",
  "darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki",
  "darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon",
  "darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise",
  "darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick",
  "floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod",
  "gray","green","greenyellow","grey","honeydew","hotpink","indianred","indigo",
  "ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue",
  "lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey",
  "lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray",
  "lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen",
  "magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple",
  "mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise",
  "mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite",
  "navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod",
  "palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink",
  "plum","powderblue","purple","red","rosybrown","royalblue","saddlebrown","salmon",
  "sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue",
  "slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle",
  "tomato","turquoise","violet","wheat","white","whitesmoke","yellow","yellowgreen",
]);

// CSS properties that carry color values
const COLOR_CSS_PROPS = new Set([
  "color","background","background-color","border","border-color","border-top-color",
  "border-right-color","border-bottom-color","border-left-color","outline","outline-color",
  "text-decoration-color","fill","stroke","stop-color","box-shadow","text-shadow",
  "caret-color","column-rule-color","accent-color",
]);

// Inline style keys (camelCase)
const COLOR_STYLE_KEYS = new Set([
  "color","background","backgroundColor","borderColor","borderTopColor","borderRightColor",
  "borderBottomColor","borderLeftColor","outlineColor","fill","stroke","textDecorationColor",
  "caretColor","accentColor","boxShadow","textShadow",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) {
    // #rgb → #rrggbb
    return "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  if (h.length === 5) {
    // #rgba → #rrggbbaa
    return "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] + h[4] + h[4];
  }
  return h;
}

function detectColorValue(value: string): boolean {
  const v = value.trim();
  return (
    HEX_RE.test(v) ||
    RGB_RE.test(v) ||
    HSL_RE.test(v) ||
    CSS_VAR_RE.test(v) ||
    NAMED_CSS_COLORS.has(v.toLowerCase())
  );
}

function isSparkleColorToken(value: string, hexSet: Set<string>): boolean {
  const v = value.trim();
  if (CSS_VAR_RE.test(v)) {
    // CSS variables from Sparkle are allowed (e.g. --tw-*)
    return true;
  }
  if (HEX_RE.test(v)) {
    return hexSet.has(normalizeHex(v));
  }
  // rgb/hsl and named colors are never sparkle tokens
  return false;
}

// ─── CSS Analysis ────────────────────────────────────────────────────────────

function analyzeCssRoot(
  root: Root,
  filePath: string,
  targetDir: string,
  hexSet: Set<string>,
  context: "css" | "scss"
): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const relPath = relativePath(targetDir, filePath);

  root.walkDecls((decl: Declaration) => {
    if (!COLOR_CSS_PROPS.has(decl.prop.toLowerCase())) return;
    const values = decl.value.split(/[\s,]+/);
    for (const val of values) {
      const v = val.trim();
      if (!detectColorValue(v)) continue;
      violations.push({
        filePath: relPath,
        line: decl.source?.start?.line ?? 0,
        column: decl.source?.start?.column ?? 0,
        property: decl.prop,
        value: v,
        context,
        isSparkleToken: isSparkleColorToken(v, hexSet),
      });
    }
  });

  return violations;
}

// ─── TSX Inline Style Analysis ───────────────────────────────────────────────

function stringLiteralValue(node: TSESTree.Expression): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function analyzeTsxFile(
  ast: TSESTree.Program,
  filePath: string,
  targetDir: string,
  hexSet: Set<string>
): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const relPath = relativePath(targetDir, filePath);

  traverseAST(ast, (node) => {
    // Inline style={{ ... }}
    if (node.type === AST_NODE_TYPES.JSXAttribute) {
      const attr = node as TSESTree.JSXAttribute;
      if (
        attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
        attr.name.name === "style" &&
        attr.value?.type === AST_NODE_TYPES.JSXExpressionContainer
      ) {
        const expr = attr.value.expression;
        if (expr.type === AST_NODE_TYPES.ObjectExpression) {
          for (const prop of expr.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            const key =
              prop.key.type === AST_NODE_TYPES.Identifier
                ? prop.key.name
                : prop.key.type === AST_NODE_TYPES.Literal
                ? String(prop.key.value)
                : null;
            if (!key || !COLOR_STYLE_KEYS.has(key)) continue;

            const val = stringLiteralValue(prop.value as TSESTree.Expression);
            if (!val || !detectColorValue(val)) continue;

            violations.push({
              filePath: relPath,
              line: prop.loc.start.line,
              column: prop.loc.start.column,
              property: key,
              value: val,
              context: "inline-style",
              isSparkleToken: isSparkleColorToken(val, hexSet),
            });
          }
        }
      }

      // className="..." — detect arbitrary Tailwind color values like text-[#fff]
      if (
        attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
        (attr.name.name === "className" || attr.name.name === "class")
      ) {
        let classStr: string | null = null;
        if (attr.value?.type === AST_NODE_TYPES.Literal) {
          classStr = String(attr.value.value);
        } else if (
          attr.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          attr.value.expression.type === AST_NODE_TYPES.Literal
        ) {
          classStr = String(
            (attr.value.expression as TSESTree.Literal).value
          );
        }
        if (classStr) {
          // Match arbitrary color values in Tailwind classes: bg-[#fff], text-[rgb(0,0,0)]
          const arbitrary = /\[([^\]]+)\]/g;
          let m;
          while ((m = arbitrary.exec(classStr)) !== null) {
            const val = m[1];
            if (detectColorValue(val)) {
              violations.push({
                filePath: relPath,
                line: attr.loc.start.line,
                column: attr.loc.start.column,
                property: "className",
                value: val,
                context: "className",
                isSparkleToken: isSparkleColorToken(val, hexSet),
              });
            }
          }
        }
      }
    }
  });

  return violations;
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export function analyzeColors(
  tsxFiles: string[],
  cssFiles: string[],
  cache: ParseCache,
  config: ScanConfig,
  registry: SparkleTokenRegistry
): ColorAnalysis {
  const hexSet = getColorHexSet(registry);
  const all: TokenViolation[] = [];

  for (const filePath of cssFiles) {
    const root = parseCssFile(filePath) as Root | null;
    if (!root) continue;
    const ctx = filePath.endsWith(".scss") ? "scss" : "css";
    all.push(...analyzeCssRoot(root, filePath, config.targetDir, hexSet, ctx));
  }

  for (const filePath of tsxFiles) {
    const ast = cache.get(filePath);
    if (!ast) continue;
    all.push(...analyzeTsxFile(ast, filePath, config.targetDir, hexSet));
  }

  const tokenColors = all.filter((v) => v.isSparkleToken);
  const nonTokenColors = all.filter((v) => !v.isSparkleToken);
  const uniqueValues = new Set(all.map((v) => v.value.toLowerCase())).size;

  return {
    tokenColors,
    nonTokenColors,
    totalUsages: all.length,
    uniqueValues,
    complianceRate: all.length > 0 ? tokenColors.length / all.length : 1,
  };
}
