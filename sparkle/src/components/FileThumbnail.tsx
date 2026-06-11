"use client";

import { cn } from "@sparkle/lib/utils";
import * as React from "react";

export type ThumbnailFile = {
  name: string;
  type: string;
};

export interface FileThumbnailProps {
  file: ThumbnailFile | File;
  className?: string;
  previewAspectRatio?: number;
  previewClassName?: string;
  previewContent?: React.ReactNode;
  previewImageUrl?: string | null;
  isLoading?: boolean;
  hasError?: boolean;
}

// Preview URLs that have completed a reveal this session. View/tab switches
// remount thumbnails; URLs in this set render instantly instead of replaying
// the blur-in, so only an image's first load animates.
const revealedPreviewImageUrls = new Set<string>();

export function FileThumbnailLoadingOverlay() {
  return (
    <div
      aria-hidden="true"
      className="s-absolute s-inset-0 s-z-10 s-overflow-hidden s-bg-muted-background dark:s-bg-muted-background-night"
    >
      <div className="s-absolute s-inset-0 s-bg-muted-background dark:s-bg-muted-background-night" />
      <div className="s-absolute s-inset-0 s-animate-pulse s-bg-background/55 motion-reduce:s-animate-none dark:s-bg-background-night/55" />
    </div>
  );
}

export function FileThumbnail({
  file: _file,
  className,
  previewAspectRatio,
  previewClassName,
  previewContent,
  previewImageUrl,
  isLoading = false,
  hasError = false,
}: FileThumbnailProps) {
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const revealFrameRef = React.useRef<number | null>(null);
  const [loadedPreviewImageUrl, setLoadedPreviewImageUrl] = React.useState<
    string | null
  >(() =>
    previewImageUrl && revealedPreviewImageUrls.has(previewImageUrl)
      ? previewImageUrl
      : null
  );
  const [failedPreviewImageUrl, setFailedPreviewImageUrl] = React.useState<
    string | null
  >(null);
  const imageFailed = Boolean(
    previewImageUrl && failedPreviewImageUrl === previewImageUrl
  );
  const isImageLoading = Boolean(
    previewImageUrl &&
      loadedPreviewImageUrl !== previewImageUrl &&
      !imageFailed &&
      !revealedPreviewImageUrls.has(previewImageUrl)
  );
  const showLoading = isLoading || isImageLoading;
  const hasPreviewContent = Boolean(previewContent);
  const showFallback =
    !showLoading &&
    (hasError || imageFailed || (!previewImageUrl && !hasPreviewContent));

  const cancelImageReveal = React.useCallback(() => {
    if (revealFrameRef.current === null) return;
    window.cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = null;
  }, []);

  const markImageLoaded = React.useCallback(
    (image: HTMLImageElement, imageUrl: string | null | undefined) => {
      if (!imageUrl) return;
      const didLoad = image.naturalWidth > 0 && image.naturalHeight > 0;
      setFailedPreviewImageUrl(didLoad ? null : imageUrl);
      if (didLoad) {
        revealedPreviewImageUrls.add(imageUrl);
        cancelImageReveal();
        revealFrameRef.current = window.requestAnimationFrame(() => {
          revealFrameRef.current = window.requestAnimationFrame(() => {
            setLoadedPreviewImageUrl(imageUrl);
            revealFrameRef.current = null;
          });
        });
      }
    },
    [cancelImageReveal]
  );

  React.useEffect(() => {
    cancelImageReveal();
    if (previewImageUrl) return;
    setLoadedPreviewImageUrl(null);
    setFailedPreviewImageUrl(null);
  }, [cancelImageReveal, previewImageUrl]);

  React.useEffect(() => cancelImageReveal, [cancelImageReveal]);

  React.useEffect(() => {
    const image = imageRef.current;
    if (!image || !previewImageUrl) return;
    if (image.complete) {
      markImageLoaded(image, previewImageUrl);
    }
  }, [markImageLoaded, previewImageUrl]);

  return (
    <div
      className={cn(
        "s-group s-overflow-hidden s-rounded-lg s-border s-border-border s-bg-background s-text-foreground dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night",
        className
      )}
    >
      <div
        className={cn(
          "s-relative s-aspect-square s-overflow-hidden s-bg-muted-background [contain:layout_paint] dark:s-bg-muted-background-night",
          previewClassName
        )}
        style={
          previewAspectRatio
            ? { aspectRatio: String(previewAspectRatio) }
            : undefined
        }
      >
        {previewImageUrl ? (
          <img
            ref={imageRef}
            src={previewImageUrl}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className={cn(
              "s-absolute s-inset-0 s-block s-size-full s-object-cover s-transition-[opacity,filter] s-duration-[160ms] s-ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:s-transition-none",
              showLoading ? "s-opacity-0 s-blur-sm" : "s-blur-0 s-opacity-100"
            )}
            onLoad={(event) => {
              markImageLoaded(event.currentTarget, previewImageUrl);
            }}
            onError={() => {
              if (previewImageUrl) {
                revealedPreviewImageUrls.delete(previewImageUrl);
                cancelImageReveal();
                setFailedPreviewImageUrl(previewImageUrl);
                setLoadedPreviewImageUrl((current) =>
                  current === previewImageUrl ? null : current
                );
              }
            }}
          />
        ) : null}
        {previewContent ? (
          <div
            className={cn(
              "s-absolute s-inset-0 s-size-full s-transition-[opacity,filter] s-duration-[160ms] s-ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:s-transition-none",
              showLoading ? "s-opacity-0 s-blur-sm" : "s-blur-0 s-opacity-100"
            )}
          >
            {previewContent}
          </div>
        ) : null}
        {showLoading ? <FileThumbnailLoadingOverlay /> : null}
        {showFallback ? (
          <div
            className="s-absolute s-inset-0 s-bg-muted-background dark:s-bg-muted-background-night"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
