import { Button } from "@sparkle/components/Button";
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
  /** Non-scrolling content pinned above the page's scrollable content, separated by a divider. */
  fixedContent?: React.ReactNode;
  /** Per-page content rendered in the footer above the buttons. */
  footerContent?: React.ReactNode;
  /**
   * Remove the default ScrollArea in the SheetContainer.
   * To be used if you want to manage the scroll yourself
   */
  noScroll?: boolean;
}

interface MultiPageSheetProps {
  /** The ordered pages hosted by the sheet. */
  pages: MultiPageSheetPage[];
  /** Id of the page currently displayed; the caller owns this state. */
  currentPageId: string;
  /** Called with the target page id when the header navigation arrows are used. */
  onPageChange: (pageId: string) => void;
  size?: React.ComponentProps<typeof SheetContent>["size"];
  side?: React.ComponentProps<typeof SheetContent>["side"];
  trapFocusScope?: boolean;
  /** Show the page counter and enable header navigation (default true). */
  showNavigation?: boolean;
  /** Show the previous/next arrow buttons in the header (default true). */
  showHeaderNavigation?: boolean;
  /** Called when the save button is clicked. */
  onSave?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  className?: string;
  /** Disable the header "next" arrow, e.g. while the current page is invalid. */
  disableNext?: boolean;
  /** Disable the save action, e.g. while the flow is incomplete. */
  disableSave?: boolean;
  /** Button rendered on the left side of the footer. */
  leftButton?: React.ComponentProps<typeof Button>;
  /** Button rendered in the footer's right-hand group, before `rightButton`. */
  centerButton?: React.ComponentProps<typeof Button>;
  /** Button rendered at the far right of the footer (marked as the sheet's save button). */
  rightButton?: React.ComponentProps<typeof Button>;
  /** Add a separator line between the content and the footer. */
  addFooterSeparator?: boolean;
}

/**
 * A side sheet that hosts multiple pages, combining a slide-in panel with
 * step-based navigation. Compose with MultiPageSheetTrigger and
 * MultiPageSheetContent; the caller controls paging via `currentPageId` and
 * `onPageChange`. Use it for multi-step flows or detail panels that should
 * keep the underlying page partially visible; for a focus-stealing centered
 * modal flow, use MultiPageDialog instead.
 * @summary Multi-page side sheet for step-based flows.
 */
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
        <div>{leftButton && <Button {...leftButton} />}</div>
        <div className="flex gap-2">
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

/**
 * The content of a MultiPageSheet: renders the current page's header (title,
 * description, icon, navigation arrows, page counter), its scrollable content
 * with optional fixed section, and a configurable footer. Mount it inside a
 * MultiPageSheet root and drive paging via `currentPageId` / `onPageChange`.
 * @summary Paged content, header, and footer of a MultiPageSheet.
 */
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
                  <Button
                    icon={ChevronLeft}
                    variant="ghost"
                    size="sm"
                    disabled={!hasPrevious}
                    onClick={handlePrevious}
                    tooltip={hasPrevious ? "Previous page" : undefined}
                  />
                  <Button
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
