import fs from "node:fs";
import path from "node:path";
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import type { TSESTree } from "@typescript-eslint/types";
import { ParseCache, parseFile } from "../parsers/tsxParser.js";
import { traverseAST } from "../parsers/astUtils.js";
import type { ComponentUsage } from "../types.js";

/** component name → declared prop names */
export type DeclaredPropsMap = Map<string, Set<string>>;

function inferComponentName(typeName: string): string | null {
  const m = typeName.match(/^([A-Z][A-Za-z0-9]*)(?:Props|PropsType|Properties)$/);
  return m ? m[1] : null;
}

function extractMemberNames(members: TSESTree.TypeElement[]): string[] {
  return members
    .filter(
      (m): m is TSESTree.TSPropertySignature =>
        m.type === AST_NODE_TYPES.TSPropertySignature &&
        m.key.type === AST_NODE_TYPES.Identifier
    )
    .map((m) => (m.key as TSESTree.Identifier).name);
}

function extractFromAST(ast: TSESTree.Program, map: DeclaredPropsMap): void {
  traverseAST(ast, (node) => {
    if (node.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
      const compName = inferComponentName(node.id.name);
      if (!compName) return;
      const names = extractMemberNames(node.body.body);
      mergeProps(map, compName, names);
    }
    if (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
      const compName = inferComponentName(node.id.name);
      if (!compName) return;
      const ta = node.typeAnnotation;
      if (ta.type === AST_NODE_TYPES.TSTypeLiteral) {
        mergeProps(map, compName, extractMemberNames(ta.members));
      }
      if (ta.type === AST_NODE_TYPES.TSIntersectionType) {
        for (const t of ta.types) {
          if (t.type === AST_NODE_TYPES.TSTypeLiteral) {
            mergeProps(map, compName, extractMemberNames(t.members));
          }
        }
      }
    }
  });
}

function mergeProps(map: DeclaredPropsMap, compName: string, names: string[]): void {
  if (!map.has(compName)) map.set(compName, new Set());
  for (const n of names) map.get(compName)!.add(n);
}

function collectTsFiles(dir: string, results: string[] = []): string[] {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !["node_modules", ".git", "dist"].includes(entry.name)) {
        collectTsFiles(path.join(dir, entry.name), results);
      } else if (entry.isFile() && /\.(tsx?|d\.ts)$/.test(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

function findSparkleSourceDir(targetDir: string): string | null {
  // Try common locations relative to targetDir
  const candidates = [
    path.join(targetDir, "node_modules/@dust-tt/sparkle/src"),
    path.join(targetDir, "../sparkle/src"),
    path.join(targetDir, "../../sparkle/src"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Scans codebase files (already in cache) + Sparkle source files for
 * interface/type declarations named `*Props`. Returns a map of
 * component name → set of declared prop names.
 */
export function extractDeclaredProps(
  cache: ParseCache,
  targetDir: string
): DeclaredPropsMap {
  const map: DeclaredPropsMap = new Map();

  // 1. Scan all already-parsed codebase files
  for (const filePath of cache.keys()) {
    const ast = cache.get(filePath);
    if (ast) extractFromAST(ast, map);
  }

  // 2. Scan Sparkle source files (not in codebase cache)
  const sparkleDir = findSparkleSourceDir(targetDir);
  if (sparkleDir) {
    const sparkleFiles = collectTsFiles(sparkleDir);
    for (const f of sparkleFiles) {
      const ast = parseFile(f);
      if (ast) extractFromAST(ast, map);
    }
  }

  return map;
}

/**
 * Merges declared-but-never-used props (totalCount=0) into each component's
 * props array. Mutates the array in place.
 */
export function mergeDeclaredProps(
  components: ComponentUsage[],
  declared: DeclaredPropsMap
): void {
  for (const comp of components) {
    const declaredSet = declared.get(comp.name);
    if (!declaredSet) continue;
    const usedNames = new Set(comp.props.map((p) => p.name));
    for (const propName of declaredSet) {
      if (!usedNames.has(propName)) {
        comp.props.push({
          name: propName,
          values: [],
          frequency: {},
          totalCount: 0,
        });
      }
    }
  }
}
