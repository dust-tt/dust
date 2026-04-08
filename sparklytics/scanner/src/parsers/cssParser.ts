import fs from "node:fs";
import postcss from "postcss";
// @ts-expect-error - postcss-scss types are not perfect
import scssSyntax from "postcss-scss";
import type { Root } from "postcss";
import { warn } from "../utils/logger.js";

export function parseCssFile(filePath: string): Root | null {
  try {
    const css = fs.readFileSync(filePath, "utf-8");
    const isScss = filePath.endsWith(".scss");
    const root = postcss.parse(css, {
      from: filePath,
      syntax: isScss ? scssSyntax : undefined,
    });
    return root;
  } catch (e) {
    warn(`Could not parse CSS file ${filePath}: ${String(e)}`);
    return null;
  }
}
