import React from "react";

import { Button, Spinner } from "@sparkle/components/";
import {
  downloadFile,
  ImageZoomDialog,
} from "@sparkle/components/ImageZoomDialog";
import { ArrowDownOnSquareIcon, XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface ImagePreviewProps {
  image: {
    alt: string;
    downloadUrl?: string;
    imageUrl?: string;
    isLoading?: boolean;
    title: string;
  };
  onClick: () => void;
  onDownload: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent) => void;
}

const ImagePreview = React.forwardRef<HTMLDivElement, ImagePreviewProps>(
  ({ image, onClick, onDownload, onClose }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          "s-group/preview s-relative s-aspect-square",
          "s-cursor-pointer s-overflow-hidden s-rounded-2xl",
          "s-bg-muted-background dark:s-bg-muted-background-night"
        )}
      >
        {image.isLoading ? (
          <div className="s-flex s-h-full s-w-full s-items-center s-justify-center">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <img
              src={image.imageUrl}
              alt={image.alt}
              className="s-h-full s-w-full s-rounded-2xl s-object-cover"
            />
            {/* Blur overlay with filename - hidden by default, shown on hover */}
            <div
              className={cn(
                "s-absolute s-inset-0 s-z-10",
                "s-flex s-items-center s-justify-center",
                "s-bg-primary-100/80 dark:s-bg-primary-100-night/80",
                "s-backdrop-blur-sm",
                "s-opacity-0 s-transition s-duration-200",
                "group-hover/preview:s-opacity-100"
              )}
            >
              <span
                className={cn(
                  "s-max-w-[90%] s-truncate s-px-2 s-text-center",
                  "s-text-sm s-font-medium",
                  "s-text-foreground dark:s-text-foreground-night"
                )}
              >
                {image.title}
              </span>
            </div>
            <div
              className={cn(
                "s-absolute s-right-1 s-top-1 s-z-10 s-flex",
                "s-opacity-0 s-transition-opacity s-duration-200",
                "group-hover/preview:s-opacity-100"
              )}
            >
              {onClose && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={XMarkIcon}
                  className="s-text-white dark:s-text-white"
                  tooltip="Remove"
                  onClick={onClose}
                />
              )}
              {!onClose && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={ArrowDownOnSquareIcon}
                  className="s-text-white dark:s-text-white"
                  tooltip="Download"
                  onClick={onDownload}
                />
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);

ImagePreview.displayName = "ImagePreview";

const SIZE_CLASSES = {
  sm: "s-h-24 s-w-24",
  md: "s-h-48 s-w-48",
  lg: "s-h-80 s-w-80",
} as const;

type InteractiveImageGridSize = keyof typeof SIZE_CLASSES;

interface InteractiveImageGridProps {
  className?: string;
  images: {
    alt: string;
    downloadUrl?: string;
    imageUrl?: string;
    isLoading?: boolean;
    title: string;
  }[];
  onClose?: () => void;
  size?: InteractiveImageGridSize;
}

function InteractiveImageGrid({
  className,
  images,
  onClose,
  size = "lg",
}: InteractiveImageGridProps) {
  const [currentImageIndex, setCurrentImageIndex] = React.useState<
    number | null
  >(null);

  const handleNext = React.useCallback(() => {
    if (currentImageIndex === null) {
      return;
    }
    setCurrentImageIndex((currentImageIndex + 1) % images.length);
  }, [currentImageIndex, images.length]);

  const handlePrevious = React.useCallback(() => {
    if (currentImageIndex === null) {
      return;
    }
    setCurrentImageIndex(
      (currentImageIndex - 1 + images.length) % images.length
    );
  }, [currentImageIndex, images.length]);

  const handleDownload = React.useCallback(
    (e: React.MouseEvent, downloadUrl?: string, title?: string) => {
      e.stopPropagation();
      if (downloadUrl && title) {
        downloadFile(downloadUrl, title);
      }
    },
    []
  );

  // Keyboard navigation for the zoomed image
  React.useEffect(() => {
    if (currentImageIndex === null) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentImageIndex, handleNext, handlePrevious]);

  const currentImage = currentImageIndex !== null ? images[currentImageIndex] : null;

  return (
    <>
      <div className={cn("s-@container", className)}>
        {images.length === 1 ? (
          <div className={SIZE_CLASSES[size]}>
            <ImagePreview
              image={images[0]}
              onClick={() => {
                if (!images[0].isLoading) {
                  setCurrentImageIndex(0);
                }
              }}
              onDownload={(e) => handleDownload(e, images[0].downloadUrl, images[0].title)}
              onClose={
                onClose
                  ? (e) => {
                      e.stopPropagation();
                      onClose();
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="s-grid s-grid-cols-2 s-gap-2 @xxs:s-grid-cols-3 @xs:s-grid-cols-4">
            {images.map((image, idx) => (
              <ImagePreview
                key={idx}
                image={image}
                onClick={() => {
                  if (!image.isLoading) {
                    setCurrentImageIndex(idx);
                  }
                }}
                onDownload={(e) => handleDownload(e, image.downloadUrl, image.title)}
              />
            ))}
          </div>
        )}
      </div>
      <ImageZoomDialog
        open={currentImageIndex !== null}
        onOpenChange={(open) => !open && setCurrentImageIndex(null)}
        image={{
          src: currentImage?.imageUrl ?? "",
          alt: currentImage?.alt,
          title: currentImage?.title,
          downloadUrl: currentImage?.downloadUrl,
          isLoading: currentImage?.isLoading,
        }}
        navigation={
          images.length > 1
            ? {
                onPrevious: handlePrevious,
                onNext: handleNext,
                hasPrevious: true,
                hasNext: true,
              }
            : undefined
        }
      />
    </>
  );
}

InteractiveImageGrid.displayName = "InteractiveImageGrid";

export { InteractiveImageGrid };
