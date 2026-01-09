import React from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Spinner,
} from "@sparkle/components/";
import {
  ArrowDownOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface ImageLoadingStateProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const ImageLoadingState = React.forwardRef<
  HTMLDivElement,
  ImageLoadingStateProps
>(({ className, size = "lg" }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-mx-auto s-flex s-aspect-square s-w-full s-min-w-[50vh]",
        "s-max-w-[80vh] s-items-center s-justify-center",
        "s-bg-muted-background dark:s-bg-muted-background-night",
        className
      )}
    >
      <Spinner variant="dark" size={size} />
    </div>
  );
});

ImageLoadingState.displayName = "ImageLoadingState";
interface ImagePreviewProps {
  image: {
    alt: string;
    downloadUrl?: string;
    imageUrl?: string;
    isLoading?: boolean;
    title: string;
  };
  onClick: () => void;
  onDownload: (e: React.MouseEvent) => Promise<void>;
  onRemove?: (e: React.MouseEvent) => void;
}

const ImagePreview = React.forwardRef<HTMLDivElement, ImagePreviewProps>(
  ({ image, onClick, onDownload, onRemove }, ref) => {
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
              {onRemove && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={XMarkIcon}
                  className="s-text-white dark:s-text-white"
                  tooltip="Remove"
                  onClick={onRemove}
                />
              )}
              {!onRemove && (
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
  onRemove?: () => void;
  size?: InteractiveImageGridSize;
}

function InteractiveImageGrid({
  className,
  images,
  onRemove,
  size = "lg",
}: InteractiveImageGridProps) {
  const [currentImageIndex, setCurrentImageIndex] = React.useState<
    number | null
  >(null);
  const [imageLoaded, setImageLoaded] = React.useState(false);

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
    async (downloadUrl?: string, title?: string) => {
      if (!downloadUrl || !title) {
        return;
      }

      // Create a hidden link and click it.
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    []
  );

  React.useEffect(() => {
    if (currentImageIndex === null) {
      return;
    }

    // Only handle keyboard events if the image is zoomed.
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

  return (
    <Dialog
      open={currentImageIndex !== null}
      onOpenChange={(open) => !open && setCurrentImageIndex(null)}
    >
      <DialogTrigger asChild>
        <div className={cn("s-@container", className)}>
          {images.length === 1 ? (
            <div className={SIZE_CLASSES[size]}>
              <ImagePreview
                image={images[0]}
                onClick={() => {
                  setCurrentImageIndex(0);
                }}
                onDownload={async (e) => {
                  e.stopPropagation();
                  await handleDownload(images[0].downloadUrl, images[0].title);
                }}
                onRemove={
                  onRemove
                    ? (e) => {
                        e.stopPropagation();
                        onRemove();
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
                    setCurrentImageIndex(idx);
                  }}
                  onDownload={async (e) => {
                    e.stopPropagation();
                    await handleDownload(image.downloadUrl, image.title);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="s-w-auto s-max-w-[90vw] s-overflow-hidden s-p-3">
        {currentImageIndex !== null && (
          <div className="s-relative s-flex s-items-center s-justify-center s-gap-2">
            {/* Previous button */}
            {images.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronLeftIcon}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevious();
                }}
              />
            )}

            {/* Image container with overlay buttons */}
            <div className="s-relative">
              {images[currentImageIndex].isLoading ? (
                <ImageLoadingState size="lg" />
              ) : (
                <>
                  <img
                    src={images[currentImageIndex].imageUrl}
                    alt={images[currentImageIndex].alt}
                    className="s-max-h-[70vh] s-max-w-full s-rounded-lg s-object-contain"
                    onLoad={() => setImageLoaded(true)}
                  />
                  {/* Close button - top right of image */}
                  <DialogClose asChild>
                    <Button
                      variant="outline"
                      size="xs"
                      icon={XMarkIcon}
                      className="s-absolute s-right-2 s-top-2"
                    />
                  </DialogClose>
                  {/* Download button - bottom right of image */}
                  {imageLoaded && (
                    <Button
                      variant="outline"
                      size="xs"
                      icon={ArrowDownOnSquareIcon}
                      tooltip="Download"
                      className="s-absolute s-bottom-2 s-right-2"
                      onClick={async () => {
                        await handleDownload(
                          images[currentImageIndex].downloadUrl,
                          images[currentImageIndex].title
                        );
                      }}
                    />
                  )}
                </>
              )}
            </div>

            {/* Next button */}
            {images.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronRightIcon}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

InteractiveImageGrid.displayName = "InteractiveImageGrid";

export { InteractiveImageGrid };
