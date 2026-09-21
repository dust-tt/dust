import { cn } from "@sparkle/lib/utils";
import React from "react";

interface DocumentSourcePreviewProps {
  source: string;
  className?: string;
}

export const DocumentSourcePreview = ({
  source,
  className,
}: DocumentSourcePreviewProps) => (
  <article className={className}>
    <div className="mx-auto max-w-[50rem] px-5 py-8 text-foreground">
      <p role="alert" className="mb-6 text-muted-foreground copy-sm">
        This document includes formatting that isn't supported yet. The original
        Markdown is shown below and editing is disabled to preserve it.
      </p>
      <pre
        className={cn(
          "overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-muted-background p-5",
          "font-mono text-sm leading-relaxed wrap-anywhere"
        )}
      >
        {source}
      </pre>
    </div>
  </article>
);
