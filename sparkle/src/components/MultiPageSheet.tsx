import * as React from "react";

import { Button, Icon, Separator } from "@sparkle/components";
import {
  Sheet,
  SheetClose,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@sparkle/components/Sheet";
import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

interface MultiPageSheetPage {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType;
  content: React.ReactNode;
  fixedContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  /**
   * Remove the default ScrollArea in the SheetContainer.
   * To be used if you want to manage the scroll yourself
   */
  noScroll?: boolean;
}

interface MultiPageSheetProps {
  pages: MultiPageSheetPage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  size?: React.ComponentProps<typeof SheetContent>["size"];
  side?: React.ComponentProps<typeof SheetContent>["side"];
  trapFocusScope?: boolean;
  showNavigation?: boolean;
  showHeaderNavigation?: boolean;
  onSave?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  className?: string;
  disableNext?: boolean;
  disableSave?: boolean;
  leftButton?: React.ComponentProps<typeof Button>;
  centerButton?: React.ComponentProps<typeof Button>;
  rightButton?: React.ComponentProps<typeof Button>;
  addFooterSeparator?: boolean;
}

const MultiPageSheetRoot = Sheet;
const MultiPageSheetTrigger = SheetTrigger;
const MultiPageSheetClose = SheetClose;

interface MultiPageSheetFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  addTopSeparator: boolean;
  leftButton?: React.ComponentProps<typeof Button>;
  centerButton?: React.ComponentProps<typeof Button>;
  rightButton?: React.ComponentProps<typeof Button>;
}

const MultiPageSheetFooter = ({
  className,
  addTopSeparator,
  children,
  leftButton,
  centerButton,
  rightButton,
  ...props
}: MultiPageSheetFooterProps) => {
  const content = (
    <div
      className={cn("s-flex s-flex-none s-flex-col s-gap-3 s-p-4", className)}
      {...props}
    >
      {children && (
        <>
          {children}
          <Separator />
        </>
      )}
      <div className="s-flex s-flex-row s-justify-between">
        <div>{leftButton && <Button {...leftButton} />}</div>
        <div className="s-flex s-gap-2">
          {centerButton && <Button {...centerButton} />}
          {rightButton && <Button data-sheet-save="true" {...rightButton} />}
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

MultiPageSheetFooter.displayName = "MultiPageSheetFooter";

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
      showHeaderNavigation = true,
      className,
      disableNext = false,
      addFooterSeparator = false,
      leftButton,
      centerButton,
      rightButton,
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
              {showNavigation && showHeaderNavigation && (
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

        <div className="s-min-h-0 s-flex-1 s-overflow-y-auto">
          <div
            className={cn(
              "s-h-full",
              currentPage.fixedContent ? "s-flex s-flex-col" : ""
            )}
          >
            {currentPage.fixedContent && (
              <>
                <div className="s-flex-none s-px-5 s-py-4">
                  {currentPage.fixedContent}
                </div>
                <Separator />
              </>
            )}
            <SheetContainer
              className={currentPage.fixedContent ? "s-flex-1" : undefined}
              noScroll={currentPage.noScroll}
            >
              {currentPage.content}
            </SheetContainer>
          </div>
        </div>

        <MultiPageSheetFooter
          leftButton={leftButton}
          centerButton={centerButton}
          rightButton={rightButton}
          addTopSeparator={addFooterSeparator}
        >
          {currentPage.footerContent}
        </MultiPageSheetFooter>
      </SheetContent>
    );
  }
);

MultiPageSheetContent.displayName = "MultiPageSheetContent";

export {
  MultiPageSheetRoot as MultiPageSheet,
  MultiPageSheetClose,
  MultiPageSheetContent,
  MultiPageSheetFooter,
  type MultiPageSheetFooterProps,
  type MultiPageSheetPage,
  type MultiPageSheetProps,
  MultiPageSheetTrigger,
};
