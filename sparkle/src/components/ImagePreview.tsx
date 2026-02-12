/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import { Button, Spinner } from "@sparkle/components/";
import {
  downloadFile,
  ImageZoomDialog,
} from "@sparkle/components/ImageZoomDialog";
import { ArrowDownOnSquareIcon, XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React, { useCallback, useState } from "react";

export const IMAGE_PREVIEW_VARIANTS = ["embedded", "standalone"] as const;
export type ImagePreviewVariantType = (typeof IMAGE_PREVIEW_VARIANTS)[number];

export const IMAGE_PREVIEW_TITLE_POSITIONS = ["bottom", "center"] as const;
export type ImagePreviewTitlePositionType =
  (typeof IMAGE_PREVIEW_TITLE_POSITIONS)[number];

const containerVariants = cva(
  cn("s-cursor-pointer s-overflow-hidden s-rounded-xl"),
  {
    variants: {
      variant: {
        // Embedded inside a parent component (like Citation) that provides the group
        embedded: "s-absolute s-inset-0",
        // Standalone, self-contained component managing its own hover
        standalone: cn(
          "s-group/image-preview",
          "s-relative s-aspect-square",
          "s-bg-muted-background dark:s-bg-muted-background-night"
        ),
      },
    },
    defaultVariants: {
      variant: "embedded",
    },
  }
);

const overlayVariants = cva(
  cn(
    "s-absolute s-inset-0 s-z-10",
    "s-bg-primary-100/60 dark:s-bg-primary-100-night/60",
    "s-opacity-0 s-transition s-duration-200"
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
      variant: {
        // Embedded: uses parent's s-group for hover
        embedded: "group-hover:s-opacity-100",
        // Standalone: uses its own s-group/image-preview
        standalone: "group-hover/image-preview:s-opacity-100",
      },
    },
    defaultVariants: {
      titlePosition: "bottom",
      variant: "embedded",
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
  extends VariantProps<typeof containerVariants>,
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
      variant = "embedded",
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
                className={cn(
                  "s-h-full s-w-full s-object-cover s-transition s-duration-200",
                  variant === "embedded"
                    ? "group-hover:s-blur-sm"
                    : "group-hover/image-preview:s-blur-sm"
                )}
              />
              {/* Overlay with title - shown on hover */}
              <div className={overlayVariants({ titlePosition, variant })}>
                <span className={titleVariants({ titlePosition })}>
                  {title}
                </span>
              </div>
              {/* Action button - top right on hover */}
              <div
                className={cn(
                  "s-absolute s-right-2 s-top-2 s-z-20",
                  "s-opacity-0 s-transition-opacity s-duration-200",
                  variant === "embedded"
                    ? "group-hover:s-opacity-100"
                    : "group-hover/image-preview:s-opacity-100"
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
