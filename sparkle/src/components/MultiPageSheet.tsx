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
  size?: "md" | "lg" | "xl";
  side?: "top" | "bottom" | "left" | "right";
  trapFocusScope?: boolean;
  showNavigation?: boolean;
  footerContent?: React.ReactNode;
  onSave?: () => void;
  className?: string;
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
      ...props
    },
    ref
  ) => {
    const currentPageIndex = pages.findIndex(
      (page) => page.id === currentPageId
    );
    const currentPage = pages[currentPageIndex];

    const handlePrevious = React.useCallback(() => {
      if (currentPageIndex > 0) {
        onPageChange(pages[currentPageIndex - 1].id);
      }
    }, [currentPageIndex, pages, onPageChange]);

    const handleNext = React.useCallback(() => {
      if (currentPageIndex < pages.length - 1) {
        onPageChange(pages[currentPageIndex + 1].id);
      }
    }, [currentPageIndex, pages, onPageChange]);

    if (!currentPage) {
      console.warn(`Page with id "${currentPageId}" not found`);
      return null;
    }

    const hasPrevious = currentPageIndex > 0;
    const hasNext = currentPageIndex < pages.length - 1;

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
                    disabled={!hasNext}
                    onClick={handleNext}
                    tooltip={hasNext ? "Next page" : undefined}
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
        >
          <div className="s-ml-auto s-flex s-items-center s-gap-2">
            {showNavigation && pages.length > 1 && hasPrevious && (
              <Button
                label="Previous"
                icon={ChevronLeftIcon}
                variant="outline"
                size="sm"
                onClick={handlePrevious}
              />
            )}
            {showNavigation && pages.length > 1 && hasNext && (
              <Button
                label="Next"
                icon={ChevronRightIcon}
                variant="outline"
                size="sm"
                onClick={handleNext}
              />
            )}
            {showNavigation && pages.length > 1 && !hasNext && onSave && (
              <Button
                label="Save changes"
                variant="primary"
                size="sm"
                onClick={onSave}
              />
            )}
            {footerContent}
          </div>
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
