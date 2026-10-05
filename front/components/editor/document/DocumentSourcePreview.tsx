import { cn } from "@dust-tt/sparkle";

interface DocumentSourcePreviewProps {
  source: string;
  /** Why editing is disabled, shown above the source. */
  reason: string;
  className?: string;
}

export const DocumentSourcePreview = ({
  source,
  reason,
  className,
}: DocumentSourcePreviewProps) => (
  <article className={className}>
    <div className="mx-auto max-w-[50rem] px-5 py-8 text-foreground">
      <p role="alert" className="mb-6 text-muted-foreground copy-sm">
        {reason} The original Markdown is shown below and editing is disabled to
        preserve it.
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
