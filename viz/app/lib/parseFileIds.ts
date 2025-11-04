import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

export function extractFileIds(code: string): string[] {
  const fileIds = new Set<string>();

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    traverse(ast, {
      CallExpression(path) {
        // Look for: useFile("fil_xxx")
        if (
          path.node.callee.type === "Identifier" &&
          path.node.callee.name === "useFile" &&
          path.node.arguments.length > 0
        ) {
          const arg = path.node.arguments[0];

          // Only extract string literals (ignore variables)
          if (arg.type === "StringLiteral") {
            fileIds.add(arg.value);
          }
        }
      },
    });
  } catch (err) {
    // If parsing fails, return empty (fail gracefully)
    console.error("Failed to parse frame code:", err);
  }

  return Array.from(fileIds);
}
