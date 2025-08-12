import { cva } from "class-variance-authority";
import * as React from "react";
import { useState } from "react";

import { Button, Icon, ScrollArea } from "@sparkle/components";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sparkle/components/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

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

const MultiPageDialogRoot = Dialog;
const MultiPageDialogTrigger = DialogTrigger;
const MultiPageDialogClose = DialogClose;

interface MultiPageDialogFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  leftButton?: React.ComponentProps<typeof Button>;
  centerButton?: React.ComponentProps<typeof Button>;
  rightButton?: React.ComponentProps<typeof Button>;
}

const MultiPageDialogFooter = ({
  className,
  children,
  leftButton,
  centerButton,
  rightButton,
  ...props
}: MultiPageDialogFooterProps) => {
  return (
    <div
      className={cn("s-flex s-flex-none s-flex-col s-gap-3 s-p-4", className)}
      {...props}
    >
      {children}
      <div className="s-flex s-flex-row s-justify-between">
        <div>{leftButton && <Button {...leftButton} />}</div>
        <div className="s-flex s-gap-2">
          {centerButton && <Button {...centerButton} />}
          {rightButton && <Button {...rightButton} />}
        </div>
      </div>
    </div>
  );
};

MultiPageDialogFooter.displayName = "MultiPageDialogFooter";

interface MultiPageDialogProps {
  pages: MultiPageDialogPage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  size?: React.ComponentProps<typeof DialogContent>["size"];
  height?: React.ComponentProps<typeof DialogContent>["height"];
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
  showNavigation?: boolean;
  showHeaderNavigation?: boolean;
  className?: string;
  disableNext?: boolean;
  leftButton?: React.ComponentProps<typeof Button>;
  centerButton?: React.ComponentProps<typeof Button>;
  rightButton?: React.ComponentProps<typeof Button>;
  footerContent?: React.ReactNode;
}

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
      height,
      trapFocusScope,
      isAlertDialog,
      showNavigation = true,
      showHeaderNavigation = true,
      className,
      disableNext = false,
      leftButton,
      centerButton,
      rightButton,
      footerContent,
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
        height={height}
        trapFocusScope={trapFocusScope}
        isAlertDialog={isAlertDialog}
        className={className}
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

          <MultiPageDialogFooter
            leftButton={leftButton}
            centerButton={centerButton}
            rightButton={rightButton}
          >
            {footerContent}
          </MultiPageDialogFooter>
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
  MultiPageDialogFooter,
  type MultiPageDialogFooterProps,
  type MultiPageDialogPage,
  type MultiPageDialogProps,
  MultiPageDialogTrigger,
};
