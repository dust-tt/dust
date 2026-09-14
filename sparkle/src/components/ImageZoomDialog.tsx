import { Button } from "@sparkle/components/Button";
import { Dialog, DialogClose, DialogContent } from "@sparkle/components/Dialog";
import { ImageWrapper } from "@sparkle/components/ImageWrapper";
import { Spinner } from "@sparkle/components/Spinner";
import {
  ChevronLeft,
  ChevronRight,
  Download01,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { useCallback, useState } from "react";

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
  /** Invoked when the dialog requests an open-state change (close button, overlay click, Escape). */
  onOpenChange: (open: boolean) => void;
  /** The image to display: `title` doubles as the download filename, `downloadUrl` enables the download button, `isLoading` shows a spinner. */
  image: {
    src: string;
    alt?: string;
    title?: string;
    downloadUrl?: string;
    isLoading?: boolean;
  };
  /** Gallery navigation callbacks; previous/next buttons render only when `hasPrevious`/`hasNext` are true. */
  navigation?: {
    onPrevious: () => void;
    onNext: () => void;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}

/**
 * A full-screen overlay for viewing an image at a larger size, controlled via
 * `open` / `onOpenChange`, with an optional download affordance and optional
 * previous/next gallery navigation. Use it to let users inspect an image at
 * full resolution; for non-image modal content, use Dialog or Sheet instead.
 *
 * @summary Full-screen image zoom dialog.
 */
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
    [image.downloadUrl, image.title]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: open and image.src are props that should trigger the reset
  React.useEffect(() => {
    setImageLoaded(false);
  }, [open, image.src]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="fit" className="overflow-hidden p-3 w-fit">
        <div className="relative flex items-center justify-center gap-2">
          {/* Previous button */}
          {navigation?.hasPrevious && (
            <Button
              variant="ghost"
              size="sm"
              icon={ChevronLeft}
              onClick={(e) => {
                e.stopPropagation();
                navigation.onPrevious();
              }}
            />
          )}

          {/* Image container */}
          <div className="relative rounded overflow-hidden">
            {image.isLoading ? (
              <div
                className={cn(
                  "mx-auto flex aspect-square w-full min-w-[50vh]",
                  "max-w-[80vh] items-center justify-center",
                  "bg-muted-background"
                )}
              >
                <Spinner variant="dark" size="lg" />
              </div>
            ) : (
              <>
                <ImageWrapper
                  src={image.src}
                  alt={image.alt ?? ""}
                  className="max-h-[calc(90vh-1.5rem)] max-w-[calc(90vw-1.5rem)]"
                  onLoad={() => setImageLoaded(true)}
                />
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    size="xs"
                    icon={XClose}
                    className="absolute right-2 top-2"
                  />
                </DialogClose>
                {imageLoaded && image.downloadUrl && (
                  <Button
                    variant="outline"
                    size="xs"
                    icon={Download01}
                    tooltip="Download"
                    className="absolute bottom-2 right-2"
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
              icon={ChevronRight}
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

export type { ImageZoomDialogProps };
export { downloadFile, ImageZoomDialog };
