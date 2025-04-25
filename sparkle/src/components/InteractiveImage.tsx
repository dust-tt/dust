import React from "react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
  IconButton,
  Spinner,
} from "@sparkle/components/";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface InteractiveImageProps {
  alt: string;
  isLoading?: boolean;
  onCopyError?: (error: unknown) => void;
  onDownloadError?: (error: unknown) => void;
  src?: string;
  title: string;
}

export function InteractiveImage({
  alt,
  isLoading = false,
  src,
  ...props
}: InteractiveImageProps) {
  const [isZoomed, setIsZoomed] = React.useState(false);

  const handleZoomToggle = React.useCallback(() => {
    setIsZoomed(!isZoomed);
  }, [isZoomed]);

  return (
    <Dialog open={isZoomed} onOpenChange={handleZoomToggle}>
      <DialogTrigger asChild>
        <div className="s-aspect-square s-h-80 s-w-80">
          <ImagePreview
            alt={alt}
            isLoading={isLoading}
            onClick={(e) => {
              if (isLoading) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              handleZoomToggle();
            }}
            src={src}
            {...props}
          />
        </div>
      </DialogTrigger>
      <DialogContent className="s-w-auto s-max-w-none s-border-0 s-outline-none s-ring-0 focus:s-outline-none focus:s-ring-0">
        <img src={src} alt={alt} className="s-object-contain" />
      </DialogContent>
    </Dialog>
  );
}

function LoadingImage() {
  return (
    <div className="s-flex s-h-full s-w-full s-items-center s-justify-center">
      <Spinner variant="dark" size="sm" />
    </div>
  );
}

type ImagePreviewProps = InteractiveImageProps & {
  onClick?: (e: React.MouseEvent) => void;
};

function ImagePreview({
  isLoading,
  onClick,
  alt,
  src,
  title,
  onCopyError,
  onDownloadError,
}: ImagePreviewProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopy = async () => {
    try {
      if (!src) {
        return;
      }

      // Fetch the image as a blob.
      const response = await fetch(src);
      const blob = await response.blob();

      // Copy to clipboard.
      await copyToClipboard(
        new ClipboardItem({
          [blob.type]: blob,
        })
      );
    } catch (error) {
      onCopyError?.(error);
    }
  };

  const handleDownload = async () => {
    try {
      if (!src) {
        return;
      }

      // Fetch the image.
      const response = await fetch(src);
      const blob = await response.blob();

      // Create a download link.
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Extract filename from URL or use a default.
      link.download = title;

      // Trigger download.
      document.body.appendChild(link);
      link.click();

      // Cleanup.
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      onDownloadError?.(error);
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "s-group/preview s-relative s-h-full s-w-full s-overflow-hidden s-rounded-2xl s-bg-muted-background dark:s-bg-muted-background-night",
        !isLoading && "s-cursor-pointer"
      )}
    >
      {isLoading ? (
        <LoadingImage />
      ) : (
        <>
          <img
            src={src}
            alt={alt}
            className="s-h-full s-w-full s-rounded-2xl s-object-cover"
          />
          {/* Dark overlay on hover */}
          <div className="s-absolute s-inset-0 s-bg-black s-opacity-0 s-transition-opacity s-duration-200 group-hover/preview:s-opacity-40" />
          {/* Icon container - only visible on hover */}
          <div className="s-absolute s-right-3 s-top-3 s-z-10 s-flex s-opacity-0 s-transition-opacity s-duration-200 group-hover/preview:s-opacity-100">
            <IconButton
              icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
              className="s-text-white"
              tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
              size="xs"
              onClick={async (e) => {
                e.stopPropagation(); // Prevent image zoom.
                await handleCopy();
              }}
            />
            <IconButton
              icon={ArrowDownOnSquareIcon}
              className="s-text-white"
              tooltip="Download"
              size="xs"
              onClick={async (e) => {
                e.stopPropagation(); // Prevent image zoom.
                await handleDownload();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
