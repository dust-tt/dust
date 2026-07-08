import { ImagePreview } from "@sparkle/components/ImagePreview";
import { ImageZoomDialog } from "@sparkle/components/ImageZoomDialog";
import { cn } from "@sparkle/lib/utils";
import React from "react";

const SIZE_CLASSES = {
  sm: "relative h-24 w-24",
  md: "relative h-48 w-48",
  lg: "relative h-80 w-80",
} as const;

type InteractiveImageGridSize = keyof typeof SIZE_CLASSES;

interface InteractiveImageGridProps {
  className?: string;
  images: {
    alt: string;
    downloadUrl?: string;
    imageUrl?: string;
    isLoading?: boolean;
    isGenerating?: boolean;
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
      <div className={cn("@container", className)}>
        {images.length === 1 ? (
          <div className={SIZE_CLASSES[size]}>
            <ImagePreview
              imgSrc={images[0].imageUrl ?? ""}
              alt={images[0].alt}
              title={images[0].title}
              downloadUrl={images[0].downloadUrl}
              isLoading={images[0].isLoading}
              isGenerating={images[0].isGenerating}
              onClick={() => setCurrentImageIndex(0)}
              onClose={onClose ? () => onClose() : undefined}
              variant="embedded"
              titlePosition="center"
              manageZoomDialog={false}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 @xxs:grid-cols-3 @xs:grid-cols-4">
            {images.map((image, idx) => (
              <ImagePreview
                key={idx}
                imgSrc={image.imageUrl ?? ""}
                alt={image.alt}
                title={image.title}
                downloadUrl={image.downloadUrl}
                isLoading={image.isLoading}
                isGenerating={image.isGenerating}
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
