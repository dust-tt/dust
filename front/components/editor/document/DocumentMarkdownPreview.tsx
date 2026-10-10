import type { UnsupportedElement } from "@app/components/editor/document/content";
import { findUnsupportedElement } from "@app/components/editor/document/content";
import { DocumentFilePreviewFallback } from "@app/components/editor/document/DocumentFilePreview";
import { DocumentFrameFallback } from "@app/components/editor/document/DocumentFrame";
import type {
  DocumentFilePreview,
  DocumentProps,
} from "@app/components/editor/document/types";
import { filePreviewDirective } from "@app/components/markdown/FilePreviewBlock";
import { getMarkdownImagePlugin } from "@app/components/markdown/MarkdownImage";
import {
  checkInputBounds,
  extractAnchors,
  parseDfm,
} from "@app/lib/markdown/dfm";
import { FILE_PREVIEW_COMPONENT_NAME } from "@app/lib/markdown/file_preview";
import {
  FRAME_EMBED_COMPONENT_NAME,
  FRAME_EMBED_DIRECTIVE_NAME,
} from "@app/lib/markdown/frame_embed";
import { isString } from "@app/types/shared/utils/general";
import { cn, Markdown } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { visit } from "unist-util-visit";

interface DocumentMarkdownPreviewProps {
  source: string;
  className?: string;
  resolveImageSource: DocumentProps["resolveImageSource"];
  renderFilePreview?: DocumentProps["renderFilePreview"];
  renderFrame?: DocumentProps["renderFrame"];
}

function frameEmbedDirective() {
  return (tree: any) => {
    visit(tree, ["leafDirective"], (node) => {
      const path = node.attributes?.path;
      if (node.name !== FRAME_EMBED_DIRECTIVE_NAME || !isString(path)) {
        return;
      }
      const data = node.data ?? (node.data = {});
      data.hName = FRAME_EMBED_COMPONENT_NAME;
      data.hProperties = { path };
    });
  };
}

const MARKDOWN_PLUGINS = [filePreviewDirective, frameEmbedDirective];

const UNSUPPORTED_ELEMENT_NOTES: Record<UnsupportedElement, MessageDescriptor> =
  {
    table: msg`This document can't be edited here yet because it has a table.`,
    html: msg`This document can't be edited here yet because it has HTML.`,
    task_list: msg`This document can't be edited here yet because it has a task list.`,
    tilde_fence: msg`This document can't be edited here yet because it has a code block fenced with ~~~.`,
    indented_fence: msg`This document can't be edited here yet because it has an indented code fence.`,
    reference_definition: msg`This document can't be edited here yet because it has a reference link definition.`,
  };

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
 * A file the editor cannot open MUST show read-only, under a note that it cannot be edited, naming
 * the element the editor cannot keep when it has a name (`findUnsupportedElement`): a file
 * the codec reads as its body rendered as Markdown, without front matter, comment anchors or comment
 * threads; any other file as its exact text. A body that fails `checkInputBounds` MUST NOT reach
 * the Markdown renderer, which parses with the same parser, and MUST show as plain text instead.
 * It MUST NOT offer any way to change the file.
 */
export const DocumentMarkdownPreview = ({
  source,
  className,
  resolveImageSource,
  renderFilePreview,
  renderFrame,
}: DocumentMarkdownPreviewProps) => {
  const { t } = useLingui();
  const preview = useMemo(() => {
    const body = readableBody(source);
    if (body === null || checkInputBounds(body) !== null) {
      return { rendered: false, text: body ?? source, element: null };
    }
    return {
      rendered: true,
      text: body,
      element: findUnsupportedElement(body),
    };
  }, [source]);
  const markdownComponents = useMemo(
    () => ({
      img: getMarkdownImagePlugin(resolveImageSource),
      [FILE_PREVIEW_COMPONENT_NAME]: ({
        path,
        title,
        contentType,
      }: {
        path: string;
        title?: string;
        contentType?: string;
      }) => {
        const preview: DocumentFilePreview = {
          path,
          title: title ?? null,
          contentType: contentType ?? null,
        };
        return renderFilePreview ? (
          renderFilePreview(preview)
        ) : (
          <DocumentFilePreviewFallback preview={preview} />
        );
      },
      [FRAME_EMBED_COMPONENT_NAME]: ({ path }: { path: string }) => (
        <div className="my-6">
          {renderFrame ? (
            renderFrame(path)
          ) : (
            <DocumentFrameFallback path={path} />
          )}
        </div>
      ),
    }),
    [resolveImageSource, renderFilePreview, renderFrame]
  );

  return (
    <article className={className}>
      <div className="mx-auto max-w-[50rem] px-5 py-8 text-foreground">
        <p role="alert" className="mb-6 text-muted-foreground copy-sm">
          {preview.element ? (
            t(UNSUPPORTED_ELEMENT_NOTES[preview.element])
          ) : (
            <Trans>
              This document uses formatting the editor doesn't support yet, so
              it can't be edited here.
            </Trans>
          )}
        </p>
        {preview.rendered ? (
          <Markdown
            content={preview.text}
            isStreaming={false}
            optimizeForStreaming={false}
            additionalMarkdownComponents={markdownComponents}
            additionalMarkdownPlugins={MARKDOWN_PLUGINS}
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
