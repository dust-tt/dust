import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { TSESTree } from "@typescript-eslint/types";
import type { Root, Declaration } from "postcss";
import type { ParseCache } from "../parsers/tsxParser.js";
import { parseCssFile } from "../parsers/cssParser.js";
import { traverseAST } from "../parsers/astUtils.js";
import { relativePath } from "../utils/fileCollector.js";
import type { ScanConfig, SparkleTokenRegistry, TokenViolation, TypographyAnalysis } from "../types.js";
import { getFontSizeSet, getLineHeightSet } from "../tokens/registry.js";

const TYPO_CSS_PROPS = new Set([
  "font-family", "font-size", "font-weight", "line-height",
]);

const TYPO_STYLE_KEYS = new Set([
  "fontFamily", "fontSize", "fontWeight", "lineHeight",
]);

const CSS_PROP_TO_STYLE: Record<string, string> = {
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "line-height": "lineHeight",
};

function isSparkleTypographyToken(
  prop: string,
  value: string,
  registry: SparkleTokenRegistry,
  fontSizeSet: Set<string>,
  lineHeightSet: Set<string>
): boolean {
  const key = CSS_PROP_TO_STYLE[prop] ?? prop;
  switch (key) {
    case "fontFamily":
      return registry.fontFamilies.some((f) =>
        value.toLowerCase().includes(f.toLowerCase())
      );
    case "fontSize":
      return fontSizeSet.has(value.trim());
    case "fontWeight": {
      const n = parseInt(value, 10);
      return !isNaN(n) && registry.fontWeights.includes(n);
    }
    case "lineHeight":
      return lineHeightSet.has(value.trim());
    default:
      return false;
  }
}

function analyzeCssTypography(
  root: Root,
  filePath: string,
  targetDir: string,
  registry: SparkleTokenRegistry,
  fontSizeSet: Set<string>,
  lineHeightSet: Set<string>,
  context: "css" | "scss"
): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const relPath = relativePath(targetDir, filePath);

  root.walkDecls((decl: Declaration) => {
    if (!TYPO_CSS_PROPS.has(decl.prop.toLowerCase())) return;
    const value = decl.value.trim();
    violations.push({
      filePath: relPath,
      line: decl.source?.start?.line ?? 0,
      column: decl.source?.start?.column ?? 0,
      property: decl.prop.toLowerCase(),
      value,
      context,
      isSparkleToken: isSparkleTypographyToken(
        decl.prop.toLowerCase(),
        value,
        registry,
        fontSizeSet,
        lineHeightSet
      ),
    });
  });

  return violations;
}

function analyzeTsxTypography(
  ast: TSESTree.Program,
  filePath: string,
  targetDir: string,
  registry: SparkleTokenRegistry,
  fontSizeSet: Set<string>,
  lineHeightSet: Set<string>
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
      if (!key || !TYPO_STYLE_KEYS.has(key)) continue;

      let value: string | null = null;
      const valNode = prop.value as TSESTree.Expression;
      if (valNode.type === AST_NODE_TYPES.Literal) {
        value = String(valNode.value);
      } else if (
        valNode.type === AST_NODE_TYPES.TemplateLiteral &&
        valNode.quasis.length === 1
      ) {
        value = valNode.quasis[0].value.raw;
      }
      if (!value) continue;

      // Map camelCase key back to CSS prop for the validator
      const cssProp = Object.entries(CSS_PROP_TO_STYLE).find(
        ([, v]) => v === key
      )?.[0] ?? key;

      violations.push({
        filePath: relPath,
        line: prop.loc.start.line,
        column: prop.loc.start.column,
        property: key,
        value,
        context: "inline-style",
        isSparkleToken: isSparkleTypographyToken(
          cssProp,
          value,
          registry,
          fontSizeSet,
          lineHeightSet
        ),
      });
    }
  });

  return violations;
}

export function analyzeTypography(
  tsxFiles: string[],
  cssFiles: string[],
  cache: ParseCache,
  config: ScanConfig,
  registry: SparkleTokenRegistry
): TypographyAnalysis {
  const fontSizeSet = getFontSizeSet(registry);
  const lineHeightSet = getLineHeightSet(registry);
  const all: TokenViolation[] = [];

  for (const filePath of cssFiles) {
    const root = parseCssFile(filePath);
    if (!root) continue;
    const ctx = filePath.endsWith(".scss") ? "scss" : "css";
    all.push(
      ...analyzeCssTypography(
        root,
        filePath,
        config.targetDir,
        registry,
        fontSizeSet,
        lineHeightSet,
        ctx
      )
    );
  }

  for (const filePath of tsxFiles) {
    const ast = cache.get(filePath);
    if (!ast) continue;
    all.push(
      ...analyzeTsxTypography(
        ast,
        filePath,
        config.targetDir,
        registry,
        fontSizeSet,
        lineHeightSet
      )
    );
  }

  const tokenTypography = all.filter((v) => v.isSparkleToken);
  const nonTokenTypography = all.filter((v) => !v.isSparkleToken);

  return {
    tokenTypography,
    nonTokenTypography,
    totalUsages: all.length,
    complianceRate: all.length > 0 ? tokenTypography.length / all.length : 1,
  };
}
