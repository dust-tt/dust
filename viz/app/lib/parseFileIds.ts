import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import logger from "@viz/app/lib/logger";

export function extractFileIds(code: string): string[] {
  const fileIds = new Set<string>();

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      strictMode: false,
    });

    traverse(ast, {
      // Extract useFile() calls.
      CallExpression(path) {
        // Look for: useFile("fil_xxx").
        if (
          path.node.callee.type === "Identifier" &&
          path.node.callee.name === "useFile" &&
          path.node.arguments.length > 0
        ) {
          const arg = path.node.arguments[0];

          // Only extract string literals (ignore variables).
          if (arg.type === "StringLiteral") {
            fileIds.add(arg.value);
          }
        }
      },
      // Extract file IDs from JSX props like fileId="fil_xxx".
      JSXAttribute(path) {
        if (
          path.node.name.type === "JSXIdentifier" &&
          path.node.name.name === "fileId" &&
          path.node.value?.type === "StringLiteral"
        ) {
          fileIds.add(path.node.value.value);
        }
      },
    });
  } catch (err) {
    // If parsing fails, return empty (fail gracefully).
    logger.error({ err }, "Failed to parse frame code:");
  }

  return Array.from(fileIds);
}
