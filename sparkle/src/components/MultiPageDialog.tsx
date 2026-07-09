import { Avatar } from "@sparkle/components/Avatar";
import { LegacyButton } from "@sparkle/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sparkle/components/Dialog";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { ChevronLeft, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";
import { useState } from "react";

const multiPageDialogLayoutVariants = cva(
  cn("flex flex-col h-full overflow-hidden")
);

interface MultiPageDialogPage {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType;
  content: React.ReactNode;
  fixedContent?: React.ReactNode;
}

const MultiPageDialogRoot = Dialog;
const MultiPageDialogTrigger = DialogTrigger;
const MultiPageDialogClose = DialogClose;

interface MultiPageDialogFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  addTopSeparator: boolean;
  leftButton?: React.ComponentProps<typeof LegacyButton>;
  centerButton?: React.ComponentProps<typeof LegacyButton>;
  rightButton?: React.ComponentProps<typeof LegacyButton>;
}

const MultiPageDialogFooter = ({
  className,
  addTopSeparator,
  children,
  leftButton,
  centerButton,
  rightButton,
  ...props
}: MultiPageDialogFooterProps) => {
  const content = (
    <div
      className={cn("flex flex-none flex-col gap-3 px-4 py-2", className)}
      {...props}
    >
      {children}
      <div className="flex flex-row justify-between">
        <div>{leftButton && <LegacyButton {...leftButton} />}</div>
        <div className="flex gap-2">
          {centerButton && <LegacyButton {...centerButton} />}
          {rightButton && <LegacyButton {...rightButton} />}
        </div>
      </div>
    </div>
  );

  return addTopSeparator ? (
    <>
      <Separator />
      {content}
    </>
  ) : (
    <>{content}</>
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
  preventAutoFocusOnClose?: boolean;
  showNavigation?: boolean;
  showHeaderNavigation?: boolean;
  className?: string;
  disableNext?: boolean;
  leftButton?: React.ComponentProps<typeof LegacyButton>;
  centerButton?: React.ComponentProps<typeof LegacyButton>;
  rightButton?: React.ComponentProps<typeof LegacyButton>;
  footerContent?: React.ReactNode;
  addFooterSeparator?: boolean;
  hideCloseButton?: boolean;
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
      preventAutoFocusOnClose,
      showNavigation = true,
      showHeaderNavigation = true,
      className,
      disableNext = false,
      addFooterSeparator = false,
      leftButton,
      centerButton,
      rightButton,
      footerContent,
      hideCloseButton,
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
        preventAutoFocusOnClose={preventAutoFocusOnClose}
        className={className}
        {...props}
      >
        <div className={cn(multiPageDialogLayoutVariants())}>
          <DialogHeader
            hideButton={hideCloseButton || showHeaderNavigation}
            className="flex-none"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {showNavigation && showHeaderNavigation && (
                  <div className="flex items-center gap-1">
                    <LegacyButton
                      icon={ChevronLeft}
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
                    <LegacyButton
                      icon={ChevronRight}
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
                    "flex items-center gap-3 transition-all duration-200 ease-out",
                    {
                      "transform opacity-0": isTransitioning,
                      "translate-x-1":
                        isTransitioning && transitionDirection === "next",
                      "-translate-x-1":
                        isTransitioning && transitionDirection === "prev",
                      "translate-x-0 opacity-100": !isTransitioning,
                    }
                  )}
                >
                  <div>
                    <DialogTitle
                      visual={
                        currentPage.icon ? (
                          <Avatar icon={currentPage.icon} size="sm" />
                        ) : undefined
                      }
                    >
                      {currentPage.title}
                    </DialogTitle>
                    {currentPage.description && (
                      <DialogDescription>
                        {currentPage.description}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </div>
              {showNavigation && pages.length > 1 && (
                <div
                  className={cn(
                    "heading-xs text-muted-foreground",
                    !hideCloseButton && "pr-8"
                  )}
                >
                  {currentPageIndex + 1}/{pages.length}
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={cn(
                "h-full transition-all duration-200 ease-out",
                {
                  "transform opacity-0": isTransitioning,
                  "translate-x-2":
                    isTransitioning && transitionDirection === "next",
                  "-translate-x-2":
                    isTransitioning && transitionDirection === "prev",
                  "translate-x-0 opacity-100": !isTransitioning,
                },
                currentPage.fixedContent ? "flex flex-col" : ""
              )}
            >
              {currentPage.fixedContent && (
                <>
                  <div className="flex-none px-5 py-4">
                    {currentPage.fixedContent}
                  </div>
                  <Separator />
                </>
              )}
              <ScrollArea
                className={currentPage.fixedContent ? "flex-1" : "h-full"}
              >
                <div className="flex flex-col gap-2 px-5">
                  {currentPage.content}
                </div>
              </ScrollArea>
            </div>
          </div>

          <MultiPageDialogFooter
            leftButton={leftButton}
            centerButton={centerButton}
            rightButton={rightButton}
            addTopSeparator={addFooterSeparator}
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
  MultiPageDialogClose,
  MultiPageDialogContent,
  MultiPageDialogFooter,
  type MultiPageDialogFooterProps,
  type MultiPageDialogPage,
  type MultiPageDialogProps,
  MultiPageDialogRoot as MultiPageDialog,
  MultiPageDialogTrigger,
};
