import * as React from "react";

import { Button, Icon } from "@sparkle/components";
import {
  Dialog,
  DialogClose,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sparkle/components/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/app";

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
  size?: React.ComponentProps<typeof DialogContent>["size"];
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
  showNavigation?: boolean;
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
      <DialogContent
        ref={ref}
        size={size}
        trapFocusScope={trapFocusScope}
        isAlertDialog={isAlertDialog}
        className={className}
        {...props}
      >
        <DialogHeader hideButton={true}>
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

        <DialogContainer>{currentPage.content}</DialogContainer>

        <DialogFooter
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
        >
          {showNavigation && pages.length > 1 && hasNext && (
            <Button
              label="Next"
              variant="outline"
              size="sm"
              disabled={disableNext}
              onClick={handleNext}
            />
          )}
          {showNavigation && pages.length > 1 && !hasNext && onSave && (
            <Button
              label="Save changes"
              variant="primary"
              size="sm"
              disabled={disableSave}
              onClick={onSave}
            />
          )}
          {footerContent}
        </DialogFooter>
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
