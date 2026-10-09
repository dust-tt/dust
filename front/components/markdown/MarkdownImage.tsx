import { resolveMarkdownImageSource } from "@app/components/markdown/image_source";
import type { LightWorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export type ResolveMarkdownImageUrl = (src: string) => string | null;

export function useResolveMarkdownImageUrl(
  owner: LightWorkspaceType | undefined
): ResolveMarkdownImageUrl {
  return useMemo(
    () => (src: string) =>
      owner ? (resolveMarkdownImageSource(owner, src)?.url ?? null) : null,
    [owner]
  );
}

interface ResolvedMarkdownImageProps {
  url: string;
  alt?: string;
  title?: string;
}

function ResolvedMarkdownImage({
  url,
  alt,
  title,
}: ResolvedMarkdownImageProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <img
      src={url}
      alt={alt}
      title={title}
      aria-busy={isLoading || undefined}
      onLoad={() => setIsLoading(false)}
      onError={() => setIsLoading(false)}
      className={cn(
        "inline-block max-w-full rounded-lg align-bottom",
        isLoading && "min-h-8 min-w-8 animate-pulse bg-muted-background"
      )}
    />
  );
}

interface MarkdownImageProps {
  src?: string;
  alt?: string;
  title?: string;
  resolveImageUrl: ResolveMarkdownImageUrl;
}

/**
 * @cc [owner:tdraier,label:product;security] markdown-image-display
 * A Markdown image MUST be displayed only from the URL `resolveImageUrl` returns for its
 * destination, showing as busy until it loads or fails; without one it MUST show as text, its alt
 * text or its destination when the alt text is empty, so the renderer never loads a source the
 * host did not resolve.
 */
function MarkdownImage({
  src,
  alt,
  title,
  resolveImageUrl,
}: MarkdownImageProps) {
  const url = src ? resolveImageUrl(src) : null;

  if (!url) {
    return (
      <span
        title={title}
        className="rounded border border-dashed border-border px-1.5 py-0.5 text-sm text-muted-foreground"
      >
        {alt || src}
      </span>
    );
  }

  return <ResolvedMarkdownImage key={url} url={url} alt={alt} title={title} />;
}

export function getMarkdownImagePlugin(
  resolveImageUrl: ResolveMarkdownImageUrl
) {
  return function MarkdownImagePlugin({
    src,
    alt,
    title,
  }: Omit<MarkdownImageProps, "resolveImageUrl">) {
    return (
      <MarkdownImage
        src={src}
        alt={alt}
        title={title}
        resolveImageUrl={resolveImageUrl}
      />
    );
  };
}
