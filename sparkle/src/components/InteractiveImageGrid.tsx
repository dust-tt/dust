/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import { ImagePreview } from "@sparkle/components/ImagePreview";
import { ImageZoomDialog } from "@sparkle/components/ImageZoomDialog";
import { cn } from "@sparkle/lib/utils";
import React from "react";

const SIZE_CLASSES = {
  sm: "s-relative s-h-24 s-w-24",
  md: "s-relative s-h-48 s-w-48",
  lg: "s-relative s-h-80 s-w-80",
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

  const currentImage =
    currentImageIndex !== null ? images[currentImageIndex] : null;

  return (
    <>
      <div className={cn("s-@container", className)}>
        {images.length === 1 ? (
          <div className={SIZE_CLASSES[size]}>
            <ImagePreview
              imgSrc={images[0].imageUrl ?? ""}
              alt={images[0].alt}
              title={images[0].title}
              downloadUrl={images[0].downloadUrl}
              isLoading={images[0].isLoading}
              onClick={() => setCurrentImageIndex(0)}
              onClose={onClose ? () => onClose() : undefined}
              variant="embedded"
              titlePosition="center"
              manageZoomDialog={false}
            />
          </div>
        ) : (
          <div className="s-grid s-grid-cols-2 s-gap-2 @xxs:s-grid-cols-3 @xs:s-grid-cols-4">
            {images.map((image, idx) => (
              <ImagePreview
                key={idx}
                imgSrc={image.imageUrl ?? ""}
                alt={image.alt}
                title={image.title}
                downloadUrl={image.downloadUrl}
                isLoading={image.isLoading}
                onClick={() => setCurrentImageIndex(idx)}
                variant="standalone"
                titlePosition="center"
                manageZoomDialog={false}
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
