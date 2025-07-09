import diff from "fast-diff";

import type { Diff } from "@app/types";

export function diffStrings(text1: string, text2: string): Diff[] {
  return diff(text1, text2).map(([type, value]) => ({
    type: type === -1 ? "delete" : type === 1 ? "insert" : "equal",
    value,
  }));
}
