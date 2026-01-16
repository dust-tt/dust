import { cva, type VariantProps } from "class-variance-authority";
import React, { useCallback, useState } from "react";

import { Button, Spinner } from "@sparkle/components/";
import {
  downloadFile,
  ImageZoomDialog,
} from "@sparkle/components/ImageZoomDialog";
import { ArrowDownOnSquareIcon, XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

export const IMAGE_PREVIEW_VARIANTS = ["absolute", "square"] as const;
export type ImagePreviewVariantType = (typeof IMAGE_PREVIEW_VARIANTS)[number];

export const IMAGE_PREVIEW_TITLE_POSITIONS = ["bottom", "center"] as const;
export type ImagePreviewTitlePositionType =
  (typeof IMAGE_PREVIEW_TITLE_POSITIONS)[number];

const containerVariants = cva(
  cn("s-group/grid-image", "s-cursor-pointer s-overflow-hidden s-rounded-xl"),
  {
    variants: {
      variant: {
        absolute: "s-absolute s-inset-0",
        square: cn(
          "s-relative s-aspect-square",
          "s-bg-muted-background dark:s-bg-muted-background-night"
        ),
      },
    },
    defaultVariants: {
      variant: "absolute",
    },
  }
);

const overlayVariants = cva(
  cn(
    "s-absolute s-inset-0 s-z-10",
    "s-bg-primary-100/60 dark:s-bg-primary-100-night/60",
    "s-opacity-0 s-transition s-duration-200",
    "group-hover/grid-image:s-opacity-100"
  ),
  {
    variants: {
      titlePosition: {
        bottom: cn(
          "s-flex s-flex-col s-items-start s-justify-end",
          "s-px-3 s-pb-7"
        ),
        center: "s-flex s-items-center s-justify-center",
      },
    },
    defaultVariants: {
      titlePosition: "bottom",
    },
  }
);

const titleVariants = cva(
  cn(
    "s-max-w-full s-truncate",
    "s-heading-sm",
    "s-text-foreground dark:s-text-foreground-night"
  ),
  {
    variants: {
      titlePosition: {
        bottom: "",
        center: "s-max-w-[90%] s-px-2 s-text-center",
      },
    },
    defaultVariants: {
      titlePosition: "bottom",
    },
  }
);

interface ImagePreviewProps
  extends
    VariantProps<typeof containerVariants>,
    VariantProps<typeof overlayVariants> {
  imgSrc: string;
  alt?: string;
  title?: string;
  downloadUrl?: string;
  isLoading?: boolean;
  onClose?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  manageZoomDialog?: boolean;
}

const ImagePreview = React.forwardRef<HTMLDivElement, ImagePreviewProps>(
  (
    {
      imgSrc,
      alt = "",
      title = "",
      downloadUrl,
      isLoading,
      onClose,
      onClick,
      className,
      variant = "absolute",
      titlePosition = "bottom",
      manageZoomDialog = true,
    },
    ref
  ) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleDownload = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (downloadUrl && title) {
          downloadFile(downloadUrl, title);
        }
      },
      [downloadUrl, title]
    );

    const handleClose = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onClose?.(e);
      },
      [onClose]
    );

    const handleImageClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!isLoading) {
          if (onClick) {
            onClick(e);
          } else if (manageZoomDialog) {
            setIsDialogOpen(true);
          }
        }
      },
      [isLoading, onClick, manageZoomDialog]
    );

    return (
      <>
        <div
          ref={ref}
          onClick={handleImageClick}
          className={cn(containerVariants({ variant }), className)}
        >
          {isLoading ? (
            <div
              className={cn(
                "s-flex s-h-full s-w-full s-items-center s-justify-center",
                "s-bg-muted-background dark:s-bg-muted-background-night"
              )}
            >
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <>
              <img
                src={imgSrc}
                alt={alt}
                className="s-h-full s-w-full s-object-cover s-transition s-duration-200 group-hover/grid-image:s-blur-sm"
              />
              {/* Overlay with title - shown on hover */}
              <div className={overlayVariants({ titlePosition })}>
                <span className={titleVariants({ titlePosition })}>
                  {title}
                </span>
              </div>
              {/* Action button - top right on hover */}
              <div
                className={cn(
                  "s-absolute s-right-2 s-top-2 s-z-20",
                  "s-opacity-0 s-transition-opacity s-duration-200",
                  "group-hover/grid-image:s-opacity-100"
                )}
              >
                {onClose && (
                  <Button
                    variant="ghost"
                    size="mini"
                    icon={XMarkIcon}
                    tooltip="Remove"
                    onClick={handleClose}
                  />
                )}
                {!onClose && downloadUrl && (
                  <Button
                    variant="ghost"
                    size="mini"
                    icon={ArrowDownOnSquareIcon}
                    tooltip="Download"
                    onClick={handleDownload}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {manageZoomDialog && (
          <ImageZoomDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            image={{
              src: imgSrc,
              alt,
              title,
              downloadUrl,
              isLoading,
            }}
          />
        )}
      </>
    );
  }
);

ImagePreview.displayName = "ImagePreview";

export { ImagePreview };
export type { ImagePreviewProps };
