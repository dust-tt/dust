import {
  checkInputBounds,
  extractAnchors,
  parseDfm,
} from "@app/lib/markdown/dfm";
import datadogLogger from "@app/logger/datadogLogger";
import { cn, Icon, InfoCircle, Markdown, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";

interface DocumentMarkdownPreviewProps {
  source: string;
  /** Why the editor refused the file, as `loadDfm` says it: technical, and not translated. */
  reason: string;
  className?: string;
}

/**
 * The body to render without its comment anchors, or null for a file the codec cannot read: its
 * exact syntax is what needs fixing, and the renderer would drop malformed directives.
 */
function readableBody(source: string): string | null {
  const parsed = parseDfm(source);
  if (parsed.isErr()) {
    return null;
  }
  const anchors = extractAnchors(parsed.value.body);
  return anchors.isOk() ? anchors.value.text : parsed.value.body;
}

/**
 * @cc [owner:PopDaph,label:product;performance] document-markdown-preview
 * A file the editor cannot open MUST show read-only, under a note that it cannot be edited with the
 * refusal reason in a tooltip, and MUST log that reason without the file's content: a file the
 * codec reads as its body rendered as Markdown, without front matter, comment anchors or comment
 * threads; any other file as its exact text. A body that fails `checkInputBounds` MUST NOT reach
 * the Markdown renderer, which parses with the same parser, and MUST show as plain text instead.
 * It MUST NOT offer any way to change the file.
 */
export const DocumentMarkdownPreview = ({
  source,
  reason,
  className,
}: DocumentMarkdownPreviewProps) => {
  const { t } = useLingui();
  // Never the content: the reason names at most an anchor id and a line.
  useEffect(() => {
    datadogLogger.warn({ reason }, "Document opened read-only");
  }, [reason]);
  const preview = useMemo(() => {
    const body = readableBody(source);
    return body !== null && checkInputBounds(body) === null
      ? { rendered: true, text: body }
      : { rendered: false, text: body ?? source };
  }, [source]);

  return (
    <article className={className}>
      <div className="mx-auto max-w-[50rem] px-5 py-8 text-foreground">
        <p role="alert" className="mb-6 text-muted-foreground copy-sm">
          <Trans>
            This document uses formatting the editor doesn't support yet, so it
            can't be edited here.
          </Trans>{" "}
          <Tooltip
            label={reason}
            tooltipTriggerAsChild
            trigger={
              <button
                type="button"
                aria-label={t`Why this document can't be edited`}
                className="inline-flex translate-y-0.5 items-center text-muted-foreground hover:text-foreground"
              >
                <Icon visual={InfoCircle} size="xs" />
              </button>
            }
          />
        </p>
        {preview.rendered ? (
          <Markdown
            content={preview.text}
            isStreaming={false}
            optimizeForStreaming={false}
          />
        ) : (
          <pre
            className={cn(
              "overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-muted-background p-5",
              "font-mono text-sm leading-relaxed wrap-anywhere"
            )}
          >
            {preview.text}
          </pre>
        )}
      </div>
    </article>
  );
};
