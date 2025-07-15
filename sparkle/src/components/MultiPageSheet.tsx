import * as React from "react";

import { Button, Icon } from "@sparkle/components";
import {
  Sheet,
  SheetClose,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@sparkle/components/Sheet";
import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/app";

interface MultiPageSheetPage {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType;
  content: React.ReactNode;
}

interface MultiPageSheetProps {
  pages: MultiPageSheetPage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  size?: React.ComponentProps<typeof SheetContent>["size"];
  side?: React.ComponentProps<typeof SheetContent>["side"];
  trapFocusScope?: boolean;
  showNavigation?: boolean;
  footerContent?: React.ReactNode;
  onSave?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  className?: string;
  disableNext?: boolean;
  disableSave?: boolean;
}

const MultiPageSheetRoot = Sheet;
const MultiPageSheetTrigger = SheetTrigger;
const MultiPageSheetClose = SheetClose;

interface MultiPageSheetContentProps extends MultiPageSheetProps {
  children?: never;
}

const MultiPageSheetContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  MultiPageSheetContentProps
>(
  (
    {
      pages,
      currentPageId,
      onPageChange,
      size = "md",
      side = "right",
      trapFocusScope,
      showNavigation = true,
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

    const handlePrevious = (
      e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
      e.preventDefault();
      if (currentPageIndex > 0) {
        onPageChange(pages[currentPageIndex - 1].id);
      }
    };

    const handleNext = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();

      if (currentPageIndex < pages.length - 1) {
        onPageChange(pages[currentPageIndex + 1].id);
      }
    };

    if (!currentPage) {
      console.warn(`Page with id "${currentPageId}" not found`);
      return null;
    }

    const hasPrevious = currentPageIndex > 0;
    const hasNext = currentPageIndex < pages.length - 1;
    const nextButtonDisabled = disableNext || !hasNext;

    return (
      <SheetContent
        ref={ref}
        size={size}
        side={side}
        trapFocusScope={trapFocusScope}
        className={className}
        {...props}
      >
        <SheetHeader hideButton={true}>
          <div className="s-flex s-items-center s-justify-between s-pr-8">
            <div className="s-flex s-items-center s-gap-3">
              {showNavigation && (
                <div className="s-flex s-items-center s-gap-1">
                  <Button
                    icon={ChevronLeftIcon}
                    variant="ghost"
                    size="sm"
                    disabled={!hasPrevious}
                    onClick={handlePrevious}
                    tooltip={hasPrevious ? "Previous page" : undefined}
                  />
                  <Button
                    icon={ChevronRightIcon}
                    variant="ghost"
                    size="sm"
                    disabled={nextButtonDisabled}
                    onClick={handleNext}
                    tooltip={hasNext && !disableNext ? "Next page" : undefined}
                  />
                </div>
              )}
              <div className="s-flex s-items-center s-gap-2">
                {currentPage.icon && (
                  <Icon
                    visual={currentPage.icon}
                    size="lg"
                    className="s-text-foreground"
                  />
                )}
                <div>
                  <SheetTitle>{currentPage.title}</SheetTitle>
                  {currentPage.description && (
                    <SheetDescription>
                      {currentPage.description}
                    </SheetDescription>
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
        </SheetHeader>

        <SheetContainer>{currentPage.content}</SheetContainer>

        <SheetFooter
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
                  onClick: handlePrevious,
                }
              : undefined
          }
          rightEndButtonProps={
            showNavigation && pages.length > 1 && hasNext
              ? {
                  label: "Next",
                  variant: "outline",
                  size: "sm",
                  disabled: disableNext,
                  onClick: handleNext,
                }
              : showNavigation && pages.length > 1 && !hasNext && onSave
                ? {
                    label: "Save changes",
                    variant: "primary",
                    size: "sm",
                    disabled: disableSave,
                    onClick: (
                      e: React.MouseEvent<HTMLButtonElement, MouseEvent>
                    ) => {
                      onSave(e);
                    },
                  }
                : undefined
          }
        >
          {footerContent}
        </SheetFooter>
      </SheetContent>
    );
  }
);

MultiPageSheetContent.displayName = "MultiPageSheetContent";

export {
  MultiPageSheetRoot as MultiPageSheet,
  MultiPageSheetClose,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  type MultiPageSheetProps,
  MultiPageSheetTrigger,
};
