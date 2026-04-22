import fs from "node:fs";
import * as parser from "@typescript-eslint/parser";
import type { TSESTree } from "@typescript-eslint/types";
import { debug, warn } from "../utils/logger.js";

export type { TSESTree };

export class ParseCache {
  private cache = new Map<string, TSESTree.Program | null>();

  parse(filePath: string): TSESTree.Program | null {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath) ?? null;
    }
    const result = parseFile(filePath);
    this.cache.set(filePath, result);
    return result;
  }

  get(filePath: string): TSESTree.Program | null {
    return this.cache.get(filePath) ?? null;
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

export function parseFile(filePath: string): TSESTree.Program | null {
  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const ast = parser.parse(code, {
      jsx: true,
      range: true,
      loc: true,
      comment: false,
      tokens: false,
      errorOnUnknownASTType: false,
    });
    debug(`Parsed: ${filePath}`);
    return ast;
  } catch (e) {
    warn(`Could not parse ${filePath}: ${String(e)}`);
    return null;
  }
}
