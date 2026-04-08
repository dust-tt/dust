import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { TSESTree } from "@typescript-eslint/types";
import type { ParseCache } from "../parsers/tsxParser.js";
import { traverseAST } from "../parsers/astUtils.js";
import { relativePath } from "../utils/fileCollector.js";
import type {
  AllElementsAnalysis,
  ComponentUsage,
  FileLocation,
  HtmlElementUsage,
  ImportBinding,
  PropOccurrence,
  ScanConfig,
} from "../types.js";

interface RawPropOccurrence {
  name: string;
  value: string;
}

interface RawUsage {
  location: FileLocation;
  props: RawPropOccurrence[];
}

class ComponentUsageBuilder {
  private binding: ImportBinding;
  private occurrences: RawUsage[] = [];

  constructor(binding: ImportBinding) {
    this.binding = binding;
  }

  addOccurrence(location: FileLocation, props: RawPropOccurrence[]): void {
    this.occurrences.push({ location, props });
  }

  build(): ComponentUsage {
    const usageCount = this.occurrences.length;
    const defaultUsageCount = this.occurrences.filter(
      (o) => o.props.filter((p) => p.name !== "key" && p.name !== "ref").length === 0
    ).length;

    // Aggregate props
    const propMap = new Map<string, Map<string, number>>();
    for (const occ of this.occurrences) {
      for (const prop of occ.props) {
        if (!propMap.has(prop.name)) {
          propMap.set(prop.name, new Map());
        }
        const valueMap = propMap.get(prop.name)!;
        valueMap.set(prop.value, (valueMap.get(prop.value) ?? 0) + 1);
      }
    }

    const props: PropOccurrence[] = Array.from(propMap.entries()).map(
      ([name, valueMap]) => {
        const frequency: Record<string, number> = {};
        let totalCount = 0;
        for (const [value, count] of valueMap) {
          frequency[value] = count;
          totalCount += count;
        }
        return {
          name,
          values: Array.from(valueMap.keys()),
          frequency,
          totalCount,
        };
      }
    );

    return {
      name: this.binding.importedName,
      importedFrom: this.binding.importedFrom,
      usageCount,
      defaultUsageCount,
      customizedUsageCount: usageCount - defaultUsageCount,
      locations: this.occurrences.map((o) => o.location),
      props,
    };
  }
}

function collectSparkleBindings(
  ast: TSESTree.Program,
  packageName: string
): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();

  for (const node of ast.body) {
    if (node.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    if (node.source.value !== packageName) continue;

    for (const specifier of node.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        const importedName =
          specifier.imported.type === AST_NODE_TYPES.Identifier
            ? specifier.imported.name
            : (specifier.imported as TSESTree.StringLiteral).value;
        const localName = specifier.local.name;
        bindings.set(localName, {
          localName,
          importedName,
          importedFrom: packageName,
        });
      } else if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        // import * as Sparkle from "@dust-tt/sparkle"
        bindings.set(`__ns__${specifier.local.name}`, {
          localName: specifier.local.name,
          importedName: "__namespace__",
          importedFrom: packageName,
        });
      }
    }
  }

  return bindings;
}

function resolveJSXName(
  name: TSESTree.JSXTagNameExpression,
  bindings: Map<string, ImportBinding>
): ImportBinding | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return bindings.get(name.name) ?? null;
  }
  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    if (name.object.type === AST_NODE_TYPES.JSXIdentifier) {
      const nsKey = `__ns__${name.object.name}`;
      if (bindings.has(nsKey) && name.property.type === AST_NODE_TYPES.JSXIdentifier) {
        return {
          localName: `${name.object.name}.${name.property.name}`,
          importedName: name.property.name,
          importedFrom: bindings.get(nsKey)!.importedFrom,
        };
      }
    }
  }
  return null;
}

function serializePropValue(
  value: TSESTree.JSXAttribute["value"]
): string {
  if (value === null) return "true"; // <Button disabled />

  if (value.type === AST_NODE_TYPES.Literal) {
    return JSON.stringify(value.value); // <Button variant="primary" />
  }

  if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
    const expr = value.expression;
    if (expr.type === AST_NODE_TYPES.JSXEmptyExpression) return "{empty}";
    if (expr.type === AST_NODE_TYPES.Literal) {
      return JSON.stringify(expr.value); // <Button size={3} />
    }
    if (expr.type === AST_NODE_TYPES.Identifier) {
      if (expr.name === "undefined") return "undefined";
      if (expr.name === "null") return "null";
      if (expr.name === "true") return "true";
      if (expr.name === "false") return "false";
      return `{${expr.name}}`; // <Button icon={ChevronIcon} />
    }
    if (
      expr.type === AST_NODE_TYPES.MemberExpression &&
      expr.object.type === AST_NODE_TYPES.Identifier &&
      expr.property.type === AST_NODE_TYPES.Identifier
    ) {
      return `{${expr.object.name}.${expr.property.name}}`; // <Button size={Size.SM} />
    }
    if (expr.type === AST_NODE_TYPES.TemplateLiteral) {
      return "{template}";
    }
    return "{expression}";
  }

  if (value.type === AST_NODE_TYPES.JSXElement) return "{jsx}";
  if (value.type === AST_NODE_TYPES.JSXFragment) return "{fragment}";

  return "{unknown}";
}

function extractProps(
  attributes: (TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute)[]
): RawPropOccurrence[] {
  const props: RawPropOccurrence[] = [];

  for (const attr of attributes) {
    if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      props.push({ name: "...spread", value: "{spread}" });
      continue;
    }
    const name =
      attr.name.type === AST_NODE_TYPES.JSXIdentifier
        ? attr.name.name
        : `${attr.name.namespace.name}:${attr.name.name.name}`;
    const value = serializePropValue(attr.value);
    props.push({ name, value });
  }
  return props;
}

export function analyzeComponents(
  tsxFiles: string[],
  cache: ParseCache,
  config: ScanConfig
): ComponentUsage[] {
  const aggregator = new Map<string, ComponentUsageBuilder>();

  for (const filePath of tsxFiles) {
    const ast = cache.get(filePath);
    if (!ast) continue;

    const bindings = collectSparkleBindings(ast, config.packageName);
    if (bindings.size === 0) continue;

    traverseAST(ast, (node) => {
      if (node.type !== AST_NODE_TYPES.JSXOpeningElement) return;

      const jsxNode = node as TSESTree.JSXOpeningElement;
      const resolved = resolveJSXName(jsxNode.name, bindings);
      if (!resolved) return;

      const location: FileLocation = {
        filePath: relativePath(config.targetDir, filePath),
        line: jsxNode.loc.start.line,
        column: jsxNode.loc.start.column,
      };

      const rawProps = extractProps(jsxNode.attributes);

      if (!aggregator.has(resolved.importedName)) {
        aggregator.set(
          resolved.importedName,
          new ComponentUsageBuilder(resolved)
        );
      }
      aggregator.get(resolved.importedName)!.addOccurrence(location, rawProps);
    });
  }

  return Array.from(aggregator.values())
    .map((b) => b.build())
    .sort((a, b) => b.usageCount - a.usageCount);
}

// ─── All-elements analysis ────────────────────────────────────────────────────

/** Collect every import in the file, bucketed by whether it's the design system package */
function collectAllBindings(
  ast: TSESTree.Program,
  packageName: string
): { sparkle: Map<string, ImportBinding>; other: Map<string, ImportBinding> } {
  const sparkle = new Map<string, ImportBinding>();
  const other = new Map<string, ImportBinding>();

  for (const node of ast.body) {
    if (node.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    const source = String(node.source.value);
    const target = source === packageName ? sparkle : other;

    for (const specifier of node.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        const importedName =
          specifier.imported.type === AST_NODE_TYPES.Identifier
            ? specifier.imported.name
            : (specifier.imported as TSESTree.StringLiteral).value;
        target.set(specifier.local.name, {
          localName: specifier.local.name,
          importedName,
          importedFrom: source,
        });
      } else if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        target.set(`__ns__${specifier.local.name}`, {
          localName: specifier.local.name,
          importedName: "__namespace__",
          importedFrom: source,
        });
      } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        target.set(specifier.local.name, {
          localName: specifier.local.name,
          importedName: specifier.local.name,
          importedFrom: source,
        });
      }
    }
  }
  return { sparkle, other };
}

function resolveFromMaps(
  name: TSESTree.JSXTagNameExpression,
  sparkle: Map<string, ImportBinding>,
  other: Map<string, ImportBinding>
): { binding: ImportBinding; isSparkle: boolean } | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    const tag = name.name;
    if (sparkle.has(tag)) return { binding: sparkle.get(tag)!, isSparkle: true };
    if (other.has(tag)) return { binding: other.get(tag)!, isSparkle: false };
    // Uppercase but not imported — treat as local component
    if (/^[A-Z]/.test(tag)) {
      return {
        binding: { localName: tag, importedName: tag, importedFrom: "local" },
        isSparkle: false,
      };
    }
    return null; // lowercase = HTML element, handled separately
  }
  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    if (name.object.type === AST_NODE_TYPES.JSXIdentifier) {
      const nsKey = `__ns__${name.object.name}`;
      const propName =
        name.property.type === AST_NODE_TYPES.JSXIdentifier
          ? name.property.name
          : null;
      if (!propName) return null;
      if (sparkle.has(nsKey)) {
        return {
          binding: { localName: `${name.object.name}.${propName}`, importedName: propName, importedFrom: sparkle.get(nsKey)!.importedFrom },
          isSparkle: true,
        };
      }
      if (other.has(nsKey)) {
        return {
          binding: { localName: `${name.object.name}.${propName}`, importedName: propName, importedFrom: other.get(nsKey)!.importedFrom },
          isSparkle: false,
        };
      }
    }
  }
  return null;
}

export function analyzeAllElements(
  tsxFiles: string[],
  cache: ParseCache,
  config: ScanConfig
): AllElementsAnalysis {
  const sparkleAgg = new Map<string, ComponentUsageBuilder>();
  const customAgg = new Map<string, ComponentUsageBuilder>();
  const htmlAgg = new Map<string, { count: number; locations: FileLocation[] }>();

  for (const filePath of tsxFiles) {
    const ast = cache.get(filePath);
    if (!ast) continue;

    const { sparkle, other } = collectAllBindings(ast, config.packageName);

    traverseAST(ast, (node) => {
      if (node.type !== AST_NODE_TYPES.JSXOpeningElement) return;
      const jsxNode = node as TSESTree.JSXOpeningElement;
      const loc: FileLocation = {
        filePath: relativePath(config.targetDir, filePath),
        line: jsxNode.loc.start.line,
        column: jsxNode.loc.start.column,
      };

      // HTML element — JSXIdentifier that starts lowercase
      if (
        jsxNode.name.type === AST_NODE_TYPES.JSXIdentifier &&
        /^[a-z]/.test(jsxNode.name.name)
      ) {
        const tag = jsxNode.name.name;
        if (!htmlAgg.has(tag)) htmlAgg.set(tag, { count: 0, locations: [] });
        const e = htmlAgg.get(tag)!;
        e.count++;
        e.locations.push(loc);
        return;
      }

      // Component element
      const resolved = resolveFromMaps(jsxNode.name, sparkle, other);
      if (!resolved) return;

      const { binding, isSparkle } = resolved;
      const agg = isSparkle ? sparkleAgg : customAgg;
      const key = binding.importedName;
      if (!agg.has(key)) agg.set(key, new ComponentUsageBuilder(binding));
      agg.get(key)!.addOccurrence(loc, extractProps(jsxNode.attributes));
    });
  }

  const sparkleComponents = Array.from(sparkleAgg.values())
    .map((b) => b.build())
    .sort((a, b) => b.usageCount - a.usageCount);

  const customComponents = Array.from(customAgg.values())
    .map((b) => b.build())
    .sort((a, b) => b.usageCount - a.usageCount);

  const htmlElements: HtmlElementUsage[] = Array.from(htmlAgg.entries())
    .map(([tag, data]) => ({ tag, usageCount: data.count, locations: data.locations }))
    .sort((a, b) => b.usageCount - a.usageCount);

  const totalSparkleUsages = sparkleComponents.reduce((s, c) => s + c.usageCount, 0);
  const totalCustomUsages = customComponents.reduce((s, c) => s + c.usageCount, 0);
  const totalHtmlUsages = htmlElements.reduce((s, e) => s + e.usageCount, 0);
  const divCount = htmlElements.find((e) => e.tag === "div")?.usageCount ?? 0;
  const sparkleRatio =
    totalSparkleUsages + totalCustomUsages > 0
      ? totalSparkleUsages / (totalSparkleUsages + totalCustomUsages)
      : 0;

  return {
    sparkleComponents,
    customComponents,
    htmlElements,
    totalSparkleUsages,
    totalCustomUsages,
    totalHtmlUsages,
    sparkleRatio,
    divCount,
  };
}
