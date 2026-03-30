import { safeLazy } from "@sparkle/lib/safeLazy";
import { SafeSuspense } from "@sparkle/lib/SafeSuspense";
import React from "react";

import type { MarkdownProps } from "./MarkdownInner";

export type { MarkdownProps } from "./MarkdownInner";
export { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";

const MarkdownInner = safeLazy(() =>
  import("./MarkdownInner").then((mod) => ({ default: mod.MarkdownInner }))
);

function MarkdownFallback() {
  return (
    <div className="s-w-full s-animate-pulse s-h-4 s-rounded s-bg-muted" />
  );
}

export const Markdown: React.FC<MarkdownProps> = (props) => (
  <SafeSuspense fallback={<MarkdownFallback />}>
    <MarkdownInner {...props} />
  </SafeSuspense>
);
