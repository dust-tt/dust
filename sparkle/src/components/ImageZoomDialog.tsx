/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import React, { useCallback, useState } from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Spinner,
} from "@sparkle/components/";
import {
  ArrowDownOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

function downloadFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface ImageZoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: {
    src: string;
    alt?: string;
    title?: string;
    downloadUrl?: string;
    isLoading?: boolean;
  };
  navigation?: {
    onPrevious: () => void;
    onNext: () => void;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}

function ImageZoomDialog({
  open,
  onOpenChange,
  image,
  navigation,
}: ImageZoomDialogProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (image.downloadUrl && image.title) {
        downloadFile(image.downloadUrl, image.title);
      }
    },
    [image.downloadUrl, image.title],
  );

  // Reset image loaded state when dialog closes or image changes
  React.useEffect(() => {
    setImageLoaded(false);
  }, [open, image.src]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        className="s-max-w-[90vw] s-overflow-hidden s-p-3 !s-w-fit"
      >
        <div className="s-relative s-flex s-items-center s-justify-center s-gap-2">
          {/* Previous button */}
          {navigation?.hasPrevious && (
            <Button
              variant="ghost"
              size="sm"
              icon={ChevronLeftIcon}
              onClick={(e) => {
                e.stopPropagation();
                navigation.onPrevious();
              }}
            />
          )}

          {/* Image container */}
          <div className="s-relative s-rounded s-overflow-hidden">
            {image.isLoading ? (
              <div
                className={cn(
                  "s-mx-auto s-flex s-aspect-square s-w-full s-min-w-[50vh]",
                  "s-max-w-[80vh] s-items-center s-justify-center",
                  "s-bg-muted-background dark:s-bg-muted-background-night",
                )}
              >
                <Spinner variant="dark" size="lg" />
              </div>
            ) : (
              <>
                <img
                  src={image.src}
                  alt={image.alt ?? ""}
                  className="s-max-h-full s-max-w-full s-object-contain"
                  onLoad={() => setImageLoaded(true)}
                />
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    size="xs"
                    icon={XMarkIcon}
                    className="s-absolute s-right-2 s-top-2"
                  />
                </DialogClose>
                {imageLoaded && image.downloadUrl && (
                  <Button
                    variant="outline"
                    size="xs"
                    icon={ArrowDownOnSquareIcon}
                    tooltip="Download"
                    className="s-absolute s-bottom-2 s-right-2"
                    onClick={handleDownload}
                  />
                )}
              </>
            )}
          </div>

          {/* Next button */}
          {navigation?.hasNext && (
            <Button
              variant="ghost"
              size="sm"
              icon={ChevronRightIcon}
              onClick={(e) => {
                e.stopPropagation();
                navigation.onNext();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

ImageZoomDialog.displayName = "ImageZoomDialog";

export { downloadFile, ImageZoomDialog };
export type { ImageZoomDialogProps };
