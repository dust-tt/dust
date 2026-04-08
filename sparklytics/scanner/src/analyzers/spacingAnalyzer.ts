import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { TSESTree } from "@typescript-eslint/types";
import type { Root, Declaration } from "postcss";
import type { ParseCache } from "../parsers/tsxParser.js";
import { parseCssFile } from "../parsers/cssParser.js";
import { traverseAST } from "../parsers/astUtils.js";
import { relativePath } from "../utils/fileCollector.js";
import type { ScanConfig, SpacingAnalysis, SparkleTokenRegistry, TokenViolation } from "../types.js";
import { getSpacingSet } from "../tokens/registry.js";

const SPACING_CSS_PROPS = new Set([
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "margin-inline", "margin-block", "margin-inline-start", "margin-inline-end",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "padding-inline", "padding-block", "padding-inline-start", "padding-inline-end",
  "gap", "row-gap", "column-gap",
]);

const SPACING_STYLE_KEYS = new Set([
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "marginInline", "marginBlock",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "paddingInline", "paddingBlock",
  "gap", "rowGap", "columnGap",
]);

// Values that are always compliant
const ALWAYS_VALID = new Set(["0", "auto", "inherit", "initial", "unset", "revert"]);

function splitShorthand(value: string): string[] {
  // Split on whitespace but don't split inside calc() or var()
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(" ) depth++;
    else if (ch === ")") depth--;
    else if (ch === " " && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isSparkleSpacing(value: string, spacingSet: Set<string>): boolean {
  const v = value.trim();
  if (ALWAYS_VALID.has(v)) return true;
  if (v.startsWith("var(--")) return true; // CSS variable
  if (v.startsWith("calc(")) return true; // calc() expressions are allowed
  return spacingSet.has(v);
}

function analyzeCssSpacing(
  root: Root,
  filePath: string,
  targetDir: string,
  spacingSet: Set<string>,
  context: "css" | "scss"
): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const relPath = relativePath(targetDir, filePath);

  root.walkDecls((decl: Declaration) => {
    if (!SPACING_CSS_PROPS.has(decl.prop.toLowerCase())) return;
    const parts = splitShorthand(decl.value);
    for (const part of parts) {
      const v = part.trim();
      if (!v || ALWAYS_VALID.has(v)) continue;
      violations.push({
        filePath: relPath,
        line: decl.source?.start?.line ?? 0,
        column: decl.source?.start?.column ?? 0,
        property: decl.prop.toLowerCase(),
        value: v,
        context,
        isSparkleToken: isSparkleSpacing(v, spacingSet),
      });
    }
  });

  return violations;
}

function analyzeTsxSpacing(
  ast: TSESTree.Program,
  filePath: string,
  targetDir: string,
  spacingSet: Set<string>
): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const relPath = relativePath(targetDir, filePath);

  traverseAST(ast, (node) => {
    if (node.type !== AST_NODE_TYPES.JSXAttribute) return;
    const attr = node as TSESTree.JSXAttribute;
    if (
      attr.name.type !== AST_NODE_TYPES.JSXIdentifier ||
      attr.name.name !== "style"
    ) return;
    if (attr.value?.type !== AST_NODE_TYPES.JSXExpressionContainer) return;

    const expr = attr.value.expression;
    if (expr.type !== AST_NODE_TYPES.ObjectExpression) return;

    for (const prop of expr.properties) {
      if (prop.type !== AST_NODE_TYPES.Property) continue;
      const key =
        prop.key.type === AST_NODE_TYPES.Identifier
          ? prop.key.name
          : prop.key.type === AST_NODE_TYPES.Literal
          ? String(prop.key.value)
          : null;
      if (!key || !SPACING_STYLE_KEYS.has(key)) continue;

      let value: string | null = null;
      const valNode = prop.value as TSESTree.Expression;
      if (valNode.type === AST_NODE_TYPES.Literal) {
        value = String(valNode.value);
        // Numeric 0 is always valid
        if (typeof valNode.value === "number" && valNode.value === 0) continue;
      } else if (
        valNode.type === AST_NODE_TYPES.TemplateLiteral &&
        valNode.quasis.length === 1
      ) {
        value = valNode.quasis[0].value.raw;
      }
      if (!value) continue;

      for (const part of splitShorthand(value)) {
        const v = part.trim();
        if (!v || ALWAYS_VALID.has(v)) continue;
        violations.push({
          filePath: relPath,
          line: prop.loc.start.line,
          column: prop.loc.start.column,
          property: key,
          value: v,
          context: "inline-style",
          isSparkleToken: isSparkleSpacing(v, spacingSet),
        });
      }
    }
  });

  return violations;
}

export function analyzeSpacing(
  tsxFiles: string[],
  cssFiles: string[],
  cache: ParseCache,
  config: ScanConfig,
  registry: SparkleTokenRegistry
): SpacingAnalysis {
  const spacingSet = getSpacingSet(registry);
  const all: TokenViolation[] = [];

  for (const filePath of cssFiles) {
    const root = parseCssFile(filePath);
    if (!root) continue;
    const ctx = filePath.endsWith(".scss") ? "scss" : "css";
    all.push(...analyzeCssSpacing(root, filePath, config.targetDir, spacingSet, ctx));
  }

  for (const filePath of tsxFiles) {
    const ast = cache.get(filePath);
    if (!ast) continue;
    all.push(...analyzeTsxSpacing(ast, filePath, config.targetDir, spacingSet));
  }

  const tokenSpacing = all.filter((v) => v.isSparkleToken);
  const nonTokenSpacing = all.filter((v) => !v.isSparkleToken);

  return {
    tokenSpacing,
    nonTokenSpacing,
    totalUsages: all.length,
    complianceRate: all.length > 0 ? tokenSpacing.length / all.length : 1,
  };
}
