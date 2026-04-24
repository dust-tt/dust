import type { TSESTree } from "@typescript-eslint/types";

type ASTNode = TSESTree.Node | TSESTree.Program;

export type Visitor = (node: ASTNode) => void;

/**
 * Depth-first AST traversal. Calls visitor for every non-null node.
 * Handles null/undefined children gracefully.
 */
export function traverseAST(root: ASTNode, visitor: Visitor): void {
  traverse(root, visitor);
}

function isAstNodeLike(val: unknown): val is Record<string, unknown> {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as { type?: unknown }).type === "string"
  );
}

function traverse(node: unknown, visitor: Visitor): void {
  if (!isAstNodeLike(node)) {
    return;
  }

  // Cast via `unknown` — AST walkers traverse a generic object graph, so the
  // type system can't verify the shape here. The `isAstNodeLike` guard is the
  // best runtime check we can do without adopting a visitor-keys library.
  visitor(node as unknown as ASTNode);

  // Recurse into all values that could be nodes or arrays of nodes.
  // Skip `parent` — it's a back-edge added by some parsers and causes cycles.
  for (const key of Object.keys(node)) {
    if (key === "parent") {
      continue;
    }
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        traverse(item, visitor);
      }
    } else if (isAstNodeLike(val)) {
      traverse(val, visitor);
    }
  }
}
