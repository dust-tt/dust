import { resolveMarkdownImageSource } from "@app/components/markdown/image_source";
import type { LightWorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { HTMLAttributeReferrerPolicy } from "react";
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

const getExternalImageUrl = (src: string): URL | null => {
  if (!URL.canParse(src)) {
    return null;
  }
  const url = new URL(src);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
};

interface ResolvedMarkdownImageProps {
  url: string;
  alt?: string;
  title?: string;
  referrerPolicy?: HTMLAttributeReferrerPolicy;
}

function ResolvedMarkdownImage({
  url,
  alt,
  title,
  referrerPolicy,
}: ResolvedMarkdownImageProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <img
      src={url}
      alt={alt}
      title={title}
      referrerPolicy={referrerPolicy}
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

interface ExternalMarkdownImageProps {
  url: URL;
  alt?: string;
  title?: string;
}

function ExternalMarkdownImage({
  url,
  alt,
  title,
}: ExternalMarkdownImageProps) {
  const { t } = useLingui();
  const [isLoadRequested, setIsLoadRequested] = useState(false);

  if (isLoadRequested) {
    return (
      <ResolvedMarkdownImage
        url={url.href}
        alt={alt}
        title={title}
        referrerPolicy="no-referrer"
      />
    );
  }

  const host = url.host;
  return (
    <button
      type="button"
      title={t`Load this image from ${host}`}
      onClick={() => setIsLoadRequested(true)}
      className="rounded border border-dashed border-border px-1.5 py-0.5 text-sm text-muted-foreground hover:border-highlight hover:text-highlight"
    >
      {alt || url.href}
    </button>
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
 * host did not resolve by itself. The one exception is an unresolved `http:` or `https:`
 * destination: its text MUST be a button that loads the image from that destination, without a
 * referrer, only once the reader clicks it.
 */
function MarkdownImage({
  src,
  alt,
  title,
  resolveImageUrl,
}: MarkdownImageProps) {
  const url = src ? resolveImageUrl(src) : null;

  if (!url) {
    const externalUrl = src ? getExternalImageUrl(src) : null;
    if (externalUrl) {
      return (
        <ExternalMarkdownImage
          key={externalUrl.href}
          url={externalUrl}
          alt={alt}
          title={title}
        />
      );
    }
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
