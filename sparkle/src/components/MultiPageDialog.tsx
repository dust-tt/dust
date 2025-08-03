import { cva } from "class-variance-authority";
import * as React from "react";
import { useState } from "react";

import { Button, Icon, ScrollArea } from "@sparkle/components";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sparkle/components/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

const MULTI_PAGE_DIALOG_SIZES = ["md", "lg", "xl"] as const;
type MultiPageDialogSizeType = (typeof MULTI_PAGE_DIALOG_SIZES)[number];

const multiPageDialogSizeClasses: Record<MultiPageDialogSizeType, string> = {
  md: "s-h-100 s-max-h-screen",
  lg: "s-h-125 s-max-h-screen",
  xl: "s-h-150 s-max-h-screen",
};

const multiPageDialogHeightVariants = cva("", {
  variants: {
    size: multiPageDialogSizeClasses,
  },
  defaultVariants: {
    size: "md",
  },
});

const multiPageDialogLayoutVariants = cva(
  cn("s-flex s-flex-col s-h-full s-overflow-hidden")
);

interface MultiPageDialogPage {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType;
  content: React.ReactNode;
}

interface MultiPageDialogProps {
  pages: MultiPageDialogPage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  size?: MultiPageDialogSizeType;
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
  showNavigation?: boolean;
  showHeaderNavigation?: boolean;
  footerContent?: React.ReactNode;
  onSave?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  className?: string;
  disableNext?: boolean;
  disableSave?: boolean;
}

const MultiPageDialogRoot = Dialog;
const MultiPageDialogTrigger = DialogTrigger;
const MultiPageDialogClose = DialogClose;

interface MultiPageDialogContentProps extends MultiPageDialogProps {
  children?: never;
}

const MultiPageDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  MultiPageDialogContentProps
>(
  (
    {
      pages,
      currentPageId,
      onPageChange,
      size = "md",
      trapFocusScope,
      isAlertDialog,
      showNavigation = true,
      showHeaderNavigation = true,
      footerContent,
      onSave,
      className,
      disableNext = false,
      disableSave = false,
      ...props
    },
    ref
  ) => {
    const currentPageIndex = pages.findIndex(
      (page) => page.id === currentPageId
    );
    const currentPage = pages[currentPageIndex];

    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionDirection, setTransitionDirection] = useState<
      "next" | "prev"
    >("next");

    const handlePrevious = (
      e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
      e.preventDefault();
      if (currentPageIndex > 0 && !isTransitioning) {
        setTransitionDirection("prev");
        setIsTransitioning(true);
        setTimeout(() => {
          onPageChange(pages[currentPageIndex - 1].id);
          setTimeout(() => setIsTransitioning(false), 50);
        }, 150);
      }
    };

    const handleNext = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      if (currentPageIndex < pages.length - 1 && !isTransitioning) {
        setTransitionDirection("next");
        setIsTransitioning(true);
        setTimeout(() => {
          onPageChange(pages[currentPageIndex + 1].id);
          setTimeout(() => setIsTransitioning(false), 50);
        }, 150);
      }
    };

    if (!currentPage) {
      console.warn(`Page with id "${currentPageId}" not found`);
      return null;
    }

    const hasPrevious = currentPageIndex > 0;
    const hasNext = currentPageIndex < pages.length - 1;
    const nextButtonDisabled = disableNext || !hasNext || isTransitioning;
    const prevButtonDisabled = !hasPrevious || isTransitioning;

    return (
      <DialogContent
        ref={ref}
        size={size}
        trapFocusScope={trapFocusScope}
        isAlertDialog={isAlertDialog}
        className={cn(multiPageDialogHeightVariants({ size }), className)}
        {...props}
      >
        <div className={cn(multiPageDialogLayoutVariants())}>
          <DialogHeader hideButton={true} className="s-flex-none">
            <div className="s-flex s-items-center s-justify-between s-pr-8">
              <div className="s-flex s-items-center s-gap-3">
                {showNavigation && showHeaderNavigation && (
                  <div className="s-flex s-items-center s-gap-1">
                    <Button
                      icon={ChevronLeftIcon}
                      variant="ghost"
                      size="sm"
                      disabled={prevButtonDisabled}
                      onClick={handlePrevious}
                      tooltip={
                        hasPrevious && !isTransitioning
                          ? "Previous page"
                          : undefined
                      }
                    />
                    <Button
                      icon={ChevronRightIcon}
                      variant="ghost"
                      size="sm"
                      disabled={nextButtonDisabled}
                      onClick={handleNext}
                      tooltip={
                        hasNext && !disableNext && !isTransitioning
                          ? "Next page"
                          : undefined
                      }
                    />
                  </div>
                )}
                <div
                  className={cn(
                    "s-flex s-items-center s-gap-2 s-transition-all s-duration-200 s-ease-out",
                    {
                      "s-transform s-opacity-0": isTransitioning,
                      "s-translate-x-1":
                        isTransitioning && transitionDirection === "next",
                      "s--translate-x-1":
                        isTransitioning && transitionDirection === "prev",
                      "s-translate-x-0 s-opacity-100": !isTransitioning,
                    }
                  )}
                >
                  {currentPage.icon && (
                    <Icon
                      visual={currentPage.icon}
                      size="lg"
                      className="s-text-foreground"
                    />
                  )}
                  <div>
                    <DialogTitle>{currentPage.title}</DialogTitle>
                    {currentPage.description && (
                      <DialogDescription>
                        {currentPage.description}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </div>
              {showNavigation && pages.length > 1 && (
                <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {currentPageIndex + 1} / {pages.length}
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="s-min-h-0 s-flex-1 s-overflow-hidden">
            <ScrollArea
              className={cn(
                "s-h-full s-transition-all s-duration-200 s-ease-out",
                {
                  "s-transform s-opacity-0": isTransitioning,
                  "s-translate-x-2":
                    isTransitioning && transitionDirection === "next",
                  "s--translate-x-2":
                    isTransitioning && transitionDirection === "prev",
                  "s-translate-x-0 s-opacity-100": !isTransitioning,
                }
              )}
            >
              <div className="s-flex s-flex-col s-gap-2 s-px-5 s-py-4">
                {currentPage.content}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter
            className="s-flex-none"
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              size: "sm",
            }}
            rightButtonProps={
              showNavigation && pages.length > 1 && hasPrevious
                ? {
                    label: "Previous",
                    variant: "outline",
                    size: "sm",
                    disabled: isTransitioning,
                    onClick: handlePrevious,
                  }
                : undefined
            }
          >
            {showNavigation && pages.length > 1 && hasNext && (
              <Button
                label="Next"
                variant="outline"
                size="sm"
                disabled={disableNext || isTransitioning}
                onClick={handleNext}
              />
            )}
            {showNavigation && pages.length > 1 && !hasNext && onSave && (
              <Button
                label="Save changes"
                variant="primary"
                size="sm"
                disabled={disableSave || isTransitioning}
                onClick={onSave}
              />
            )}
            {footerContent}
          </DialogFooter>
        </div>
      </DialogContent>
    );
  }
);

MultiPageDialogContent.displayName = "MultiPageDialogContent";

export {
  MultiPageDialogRoot as MultiPageDialog,
  MultiPageDialogClose,
  MultiPageDialogContent,
  type MultiPageDialogPage,
  type MultiPageDialogProps,
  MultiPageDialogTrigger,
};
