import React from "react";

import { Button, Spinner } from "@sparkle/components/";
import {
  ArrowDownOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface InteractiveImageGridProps {
  className?: string;
  images: {
    alt: string;
    downloadUrl?: string;
    imageUrl?: string;
    isLoading?: boolean;
    title: string;
  }[];
}

const InteractiveImageGrid = React.forwardRef<
  HTMLDivElement,
  InteractiveImageGridProps
>(({ className, images }, ref) => {
  const [currentImageIndex, setCurrentImageIndex] = React.useState<
    number | null
  >(null);
  const [isZoomed, setIsZoomed] = React.useState(false);
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
    if (!isZoomed) {
      return;
    }

    // Only handle keyboard events if the image is zoomed.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      } else if (e.key === "Escape") {
        setIsZoomed(false);
        setCurrentImageIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZoomed, handleNext, handlePrevious]);

  return (
    <div ref={ref} className={cn("s-@container", className)}>
      <div className="s-grid s-grid-cols-2 s-gap-2 @xxs:s-grid-cols-3 @xs:s-grid-cols-4">
        {images.map((image, idx) => (
          <div
            key={idx}
            onClick={() => {
              setCurrentImageIndex(idx);
              setIsZoomed(true);
            }}
            className={cn(
              "s-group/preview s-relative s-aspect-square s-h-full s-w-full",
              "s-cursor-pointer s-overflow-hidden s-rounded-2xl",
              "s-bg-muted-background dark:s-bg-muted-background-night"
            )}
          >
            {image.isLoading ? (
              <div
                className={cn(
                  "s-flex s-h-full s-w-full s-items-center s-justify-center"
                )}
              >
                <Spinner variant="dark" size="md" />
              </div>
            ) : (
              <>
                <img
                  src={image.imageUrl}
                  alt={image.alt}
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
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={ArrowDownOnSquareIcon}
                    className="s-text-white dark:s-text-white"
                    tooltip="Download"
                    onClick={async (e) => {
                      e.stopPropagation(); // Prevent image zoom.
                      await handleDownload(image.downloadUrl, image.title);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {isZoomed && currentImageIndex !== null && (
        <div
          className={cn(
            "s-fixed s-inset-0 s-z-50 s-flex s-items-center s-justify-center",
            "s-bg-white/95 dark:s-bg-gray-900/95"
          )}
        >
          <div className="s-relative s-flex s-h-full s-w-full s-flex-col">
            {/* Top bar */}
            <div className="s-absolute s-right-4 s-top-4 s-z-10 s-flex s-gap-2">
              <Button
                variant="outline"
                size="md"
                icon={XMarkIcon}
                tooltip="Close"
                onClick={() => {
                  setIsZoomed(false);
                  setCurrentImageIndex(null);
                }}
              />
            </div>

            {/* Main content */}
            <div className="s-flex s-flex-1 s-items-center s-justify-center">
              <div className="s-relative s-flex s-items-center s-gap-4">
                {images.length > 1 && (
                  <Button
                    variant="ghost"
                    size="md"
                    icon={ChevronLeftIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevious();
                    }}
                  />
                )}
                {images[currentImageIndex].isLoading ? (
                  <div
                    className={cn(
                      "s-mx-auto s-flex s-aspect-square s-w-full s-min-w-[1024px]",
                      "s-max-w-[80vh] s-items-center s-justify-center",
                      "s-bg-muted-background dark:s-bg-muted-background-night"
                    )}
                  >
                    <Spinner variant="dark" size="lg" />
                  </div>
                ) : (
                  <img
                    src={images[currentImageIndex].imageUrl}
                    alt={images[currentImageIndex].alt}
                    className={cn(
                      "s-max-h-[90vh] s-min-h-[50vh] s-w-auto s-min-w-[1024px]",
                      "s-object-contain"
                    )}
                    onLoad={() => setImageLoaded(true)}
                  />
                )}
                {images.length > 1 && (
                  <Button
                    variant="ghost"
                    size="md"
                    icon={ChevronRightIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                  />
                )}
              </div>
            </div>

            {/* Bottom controls */}
            {!images[currentImageIndex].isLoading && (
              <>
                {imageLoaded && (
                  <div className="s-absolute s-bottom-4 s-right-4 s-z-10">
                    <Button
                      variant="outline"
                      size="md"
                      icon={ArrowDownOnSquareIcon}
                      tooltip="Download"
                      onClick={async () => {
                        await handleDownload(
                          images[currentImageIndex].downloadUrl,
                          images[currentImageIndex].title
                        );
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

InteractiveImageGrid.displayName = "InteractiveImageGrid";

export { InteractiveImageGrid };
