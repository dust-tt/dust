import fs from "node:fs";
import type { Root } from "postcss";
import postcss from "postcss";
import scssSyntax from "postcss-scss";
import { warn } from "../utils/logger.js";

export function parseCssFile(filePath: string): Root | null {
  try {
    const css = fs.readFileSync(filePath, "utf-8");
    const isScss = filePath.endsWith(".scss");
    const root = postcss.parse(css, {
      from: filePath,
      // postcss-scss ships as a Syntax but the `syntax` option is missing
      // from postcss' ProcessOptions overload we pick up here.
      // @ts-expect-error
      syntax: isScss ? scssSyntax : undefined,
    });
    return root;
  } catch (e) {
    warn(`Could not parse CSS file ${filePath}: ${String(e)}`);
    return null;
  }
}
