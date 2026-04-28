import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import logger from "@viz/app/lib/logger";

export type FileRef =
  | { type: "fileId"; fileId: string }
  | { type: "path"; scopedPath: string };

function isScopedPath(value: string): boolean {
  // TODO(20260428 FILE SYSTEM) Add support for project.
  return value.startsWith("conversation/");
}

export function extractFileRefs(code: string): FileRef[] {
  const seen = new Set<string>();
  const refs: FileRef[] = [];

  function add(value: string) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    if (/^fil_[a-zA-Z0-9]{10,}$/.test(value)) {
      refs.push({ type: "fileId", fileId: value });
    } else if (isScopedPath(value)) {
      refs.push({ type: "path", scopedPath: value });
    }
  }

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      strictMode: false,
    });

    traverse(ast, {
      // Extract useFile() calls.
      CallExpression(path) {
        if (
          path.node.callee.type === "Identifier" &&
          path.node.callee.name === "useFile" &&
          path.node.arguments.length > 0
        ) {
          const arg = path.node.arguments[0];
          if (arg.type === "StringLiteral") {
            add(arg.value);
          }
        }
      },
      // Extract file refs from JSX props like fileId="fil_xxx".
      JSXAttribute(path) {
        if (
          path.node.name.type === "JSXIdentifier" &&
          path.node.name.name === "fileId" &&
          path.node.value?.type === "StringLiteral"
        ) {
          add(path.node.value.value);
        }
      },
      // Extract fil_xxx patterns and scoped paths from all string literals.
      StringLiteral(path) {
        const value = path.node.value;
        if (typeof value === "string") {
          add(value);
        }
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to parse frame code:");
  }

  return refs;
}
