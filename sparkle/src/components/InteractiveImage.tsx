import React from "react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
  IconButton,
  Spinner,
} from "@sparkle/components/";
import { ArrowDownOnSquareIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface DownloadButtonProps {
  className?: string;
  downloadUrl?: string;
  size?: "xs" | "sm" | "md";
  title: string;
}

function DownloadButton({
  className,
  downloadUrl,
  size = "xs",
  title,
}: DownloadButtonProps) {
  const handleDownload = React.useCallback(async () => {
    if (!downloadUrl) {
      return;
    }

    // Create a hidden link and click it.
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = title;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl, title]);

  return (
    <IconButton
      icon={ArrowDownOnSquareIcon}
      className={cn("s-text-white", className)}
      tooltip="Download"
      size={size}
      onClick={async (e) => {
        e.stopPropagation(); // Prevent image zoom.
        await handleDownload();
      }}
    />
  );
}

interface InteractiveImageProps {
  alt: string;
  downloadUrl?: string;
  imageUrl?: string;
  isLoading?: boolean;
  title: string;
}

export function InteractiveImage({
  alt,
  downloadUrl,
  imageUrl,
  isLoading = false,
  ...props
}: InteractiveImageProps) {
  const [isZoomed, setIsZoomed] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);

  const handleZoomToggle = React.useCallback(() => {
    setIsZoomed(!isZoomed);
  }, [isZoomed]);

  return (
    <Dialog open={isZoomed} onOpenChange={handleZoomToggle}>
      <DialogTrigger asChild>
        <div className="s-aspect-square s-h-80 s-w-80">
          <ImagePreview
            alt={alt}
            downloadUrl={downloadUrl}
            isLoading={isLoading}
            onClick={(e) => {
              if (isLoading) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              handleZoomToggle();
            }}
            imageUrl={imageUrl}
            {...props}
          />
        </div>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "s-w-auto s-max-w-none s-border-0 s-outline-none s-ring-0",
          "focus:s-outline-none focus:s-ring-0",
          "s-rounded-none s-bg-transparent s-shadow-none"
        )}
        size="xl"
      >
        <div className="s-flex s-flex-col">
          <div className="s-flex s-justify-end">
            {imageLoaded && (
              <DownloadButton
                downloadUrl={downloadUrl}
                title={props.title}
                size="md"
              />
            )}
          </div>
          <div className="s-relative s-w-full">
            <img
              src={imageUrl}
              alt={alt}
              className="s-w-full s-object-contain"
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingImage() {
  return (
    <div className="s-flex s-h-full s-w-full s-items-center s-justify-center">
      <Spinner variant="dark" size="md" />
    </div>
  );
}

type ImagePreviewProps = InteractiveImageProps & {
  onClick?: (e: React.MouseEvent) => void;
};

function ImagePreview({
  alt,
  downloadUrl,
  imageUrl,
  isLoading,
  onClick,
  title,
}: ImagePreviewProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "s-group/preview s-relative s-h-full s-w-full s-overflow-hidden s-rounded-2xl",
        "s-bg-muted-background dark:s-bg-muted-background-night",
        !isLoading && "s-cursor-pointer"
      )}
    >
      {isLoading ? (
        <LoadingImage />
      ) : (
        <>
          <img
            src={imageUrl}
            alt={alt}
            className="s-h-full s-w-full s-rounded-2xl s-object-cover"
          />
          {/* Dark overlay on hover */}
          <div
            className={cn(
              "s-absolute s-inset-0 s-bg-gradient-to-b",
              "s-from-black/40 s-via-transparent s-to-black/40",
              "s-opacity-0 s-transition-opacity s-duration-200",
              "group-hover/preview:s-opacity-100"
            )}
          />
          {/* Icon container - only visible on hover */}
          <div
            className={cn(
              "s-absolute s-right-3 s-top-3 s-z-10 s-flex",
              "s-opacity-0 s-transition-opacity s-duration-200",
              "group-hover/preview:s-opacity-100"
            )}
          >
            <DownloadButton downloadUrl={downloadUrl} title={title} size="xs" />
          </div>
        </>
      )}
    </div>
  );
}
