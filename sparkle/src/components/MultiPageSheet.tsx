import { LegacyButton } from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { Separator } from "@sparkle/components/Separator";
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
import { ChevronLeft, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

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
  leftButton?: React.ComponentProps<typeof LegacyButton>;
  centerButton?: React.ComponentProps<typeof LegacyButton>;
  rightButton?: React.ComponentProps<typeof LegacyButton>;
  addFooterSeparator?: boolean;
}

const MultiPageSheetRoot = Sheet;
const MultiPageSheetTrigger = SheetTrigger;
const MultiPageSheetClose = SheetClose;

interface MultiPageSheetFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  addTopSeparator: boolean;
  leftButton?: React.ComponentProps<typeof LegacyButton>;
  centerButton?: React.ComponentProps<typeof LegacyButton>;
  rightButton?: React.ComponentProps<typeof LegacyButton>;
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
      className={cn("flex flex-none flex-col gap-3 p-4", className)}
      {...props}
    >
      {children && (
        <>
          {children}
          <Separator />
        </>
      )}
      <div className="flex flex-row justify-between">
        <div>{leftButton && <LegacyButton {...leftButton} />}</div>
        <div className="flex gap-2">
          {centerButton && <LegacyButton {...centerButton} />}
          {rightButton && (
            <LegacyButton data-sheet-save="true" {...rightButton} />
          )}
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
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-3">
              {showNavigation && showHeaderNavigation && (
                <div className="flex items-center gap-1">
                  <LegacyButton
                    icon={ChevronLeft}
                    variant="ghost"
                    size="sm"
                    disabled={!hasPrevious}
                    onClick={handlePrevious}
                    tooltip={hasPrevious ? "Previous page" : undefined}
                  />
                  <LegacyButton
                    icon={ChevronRight}
                    variant="ghost"
                    size="sm"
                    disabled={nextButtonDisabled}
                    onClick={handleNext}
                    tooltip={hasNext && !disableNext ? "Next page" : undefined}
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                {currentPage.icon && (
                  <Icon
                    visual={currentPage.icon}
                    size="lg"
                    className="text-foreground"
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
              <div className="text-xs text-muted-foreground">
                {currentPageIndex + 1} / {pages.length}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "h-full",
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
            <SheetContainer
              className={currentPage.fixedContent ? "flex-1" : undefined}
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
  MultiPageSheetClose,
  MultiPageSheetContent,
  MultiPageSheetFooter,
  type MultiPageSheetFooterProps,
  type MultiPageSheetPage,
  type MultiPageSheetProps,
  MultiPageSheetRoot as MultiPageSheet,
  MultiPageSheetTrigger,
};
