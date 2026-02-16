/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import { Button, type ButtonProps } from "@sparkle/components/Button";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparkle/components/Dialog";
import { Input } from "@sparkle/components/Input";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { LinkMIcon, XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

export type ToolbarVariant = "inline" | "overlay";

type ToolbarButtonSize = NonNullable<ButtonProps["size"]>;

const toolbarRootVariants = cva("s-inline-flex s-items-center", {
  variants: {
    variant: {
      overlay:
        "s-absolute s-left-0 s-top-0 s-z-10 s-justify-start s-gap-3 s-overflow-hidden s-rounded-xl s-bg-primary-50 s-py-1 s-pl-3 s-duration-700 s-ease-in-out dark:s-bg-muted-background-night",
      inline:
        "s-gap-1 s-border-b s-border-t s-border-border s-bg-background s-p-1 dark:s-border-border-night/50 dark:s-bg-background-night sm:s-rounded-2xl sm:s-border sm:s-border-border/50 sm:s-shadow-md",
    },
  },
  defaultVariants: {
    variant: "inline",
  },
});

const toolbarContentVariants = cva("", {
  variants: {
    variant: {
      overlay:
        "s-flex s-h-full s-w-max s-flex-row s-items-center s-gap-3 s-px-3",
      inline: "s-inline-flex s-items-center s-gap-1",
    },
    scrollable: {
      true: "s-overflow-x-scroll",
      false: "",
    },
  },
  defaultVariants: {
    variant: "inline",
    scrollable: false,
  },
});

const toolbarScrollAreaVariants = cva("s-h-full s-w-full", {
  variants: {
    variant: {
      overlay: "s-border-l s-border-border dark:s-border-border-night/50",
      inline: "",
    },
  },
  defaultVariants: {
    variant: "inline",
  },
});

export interface ToolbarProps {
  variant?: ToolbarVariant;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  scrollAreaClassName?: string;
  scroll?: boolean;
  onClose?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  closeButtonProps?: Omit<ButtonProps, "icon" | "onClick" | "label">;
  startSlot?: React.ReactNode;
}

function Toolbar({
  variant = "inline",
  children,
  className,
  contentClassName,
  scrollAreaClassName,
  scroll,
  onClose,
  closeButtonProps,
  startSlot,
}: ToolbarProps) {
  const isOverlay = variant === "overlay";
  const isScrollable = scroll ?? isOverlay;
  const {
    size: closeButtonSizeProp,
    variant: closeVariant = "outline",
    ...restCloseButtonProps
  } = closeButtonProps ?? {};
  const closeButtonSize: ToolbarButtonSize = closeButtonSizeProp ?? "mini";

  const rootClassName = toolbarRootVariants({ variant, className });
  const contentBaseClassName = toolbarContentVariants({
    variant,
    scrollable: isScrollable,
    className: contentClassName,
  });
  const scrollAreaClassNames = toolbarScrollAreaVariants({
    variant,
    className: scrollAreaClassName,
  });

  function renderCloseButton(): JSX.Element | null {
    if (!onClose) {
      return null;
    }

    const buttonProps = {
      variant: closeVariant,
      icon: XMarkIcon,
      onClick: onClose,
      ...restCloseButtonProps,
    };

    if (closeButtonSize === "mini") {
      return <Button size="icon" {...buttonProps} />;
    }

    return <Button size={closeButtonSize} {...buttonProps} />;
  }

  const closeButton = renderCloseButton();

  const leadingContent = startSlot ?? closeButton;
  const content = <div className={contentBaseClassName}>{children}</div>;

  return (
    <div className={rootClassName}>
      {leadingContent}
      {isScrollable ? (
        <ScrollArea
          orientation="horizontal"
          className={scrollAreaClassNames}
          hideScrollBar
        >
          {content}
        </ScrollArea>
      ) : (
        content
      )}
    </div>
  );
}

export interface ToolbarContentGroup {
  id: string;
  items: readonly React.ReactNode[];
}

export interface ToolbarContentProps {
  groups: readonly ToolbarContentGroup[];
  separatorClassName?: string;
}

function ToolbarContent({ groups, separatorClassName }: ToolbarContentProps) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          {group.items}
          {groupIndex < groups.length - 1 && (
            <Separator
              orientation="vertical"
              className={cn("s-my-1", separatorClassName)}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
}

export interface ToolbarIconProps {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  size: ToolbarButtonSize;
  active?: boolean;
  tooltip?: string;
}

function ToolbarIcon({
  icon,
  onClick,
  size,
  active,
  tooltip,
}: ToolbarIconProps) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  }

  if (size === "mini") {
    return (
      <Button
        tooltip={tooltip}
        icon={icon}
        onClick={handleClick}
        size="icon"
        variant={active ? "ghost" : "ghost-secondary"}
      />
    );
  }

  return (
    <Button
      tooltip={tooltip}
      icon={icon}
      onClick={handleClick}
      size={size}
      variant={active ? "ghost" : "ghost-secondary"}
    />
  );
}

export interface ToolbarLinkProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDialog: () => void;
  onSubmit: () => void;
  linkText: string;
  linkUrl: string;
  onLinkTextChange: (value: string) => void;
  onLinkUrlChange: (value: string) => void;
  size: ToolbarButtonSize;
  active?: boolean;
  tooltip?: string;
}

function ToolbarLink({
  isOpen,
  onOpenChange,
  onOpenDialog,
  onSubmit,
  linkText,
  linkUrl,
  onLinkTextChange,
  onLinkUrlChange,
  size,
  active,
  tooltip,
}: ToolbarLinkProps) {
  function handleDialogClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
  }

  function handleCancelClick(): void {
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <ToolbarIcon
        icon={LinkMIcon}
        onClick={onOpenDialog}
        active={active}
        tooltip={tooltip}
        size={size}
      />
      <DialogContent onClick={handleDialogClick}>
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
          <DialogDescription>
            Add a link to your message with custom text.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <Input
            id="link-text"
            label="Text"
            placeholder="Text"
            value={linkText}
            onChange={(event) => onLinkTextChange(event.target.value)}
          />
          <Input
            id="link-url"
            label="Link"
            placeholder="Link"
            value={linkUrl}
            autoFocus
            onChange={(event) => onLinkUrlChange(event.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancelClick,
          }}
          rightButtonProps={{
            label: "Save",
            variant: "highlight",
            onClick: onSubmit,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export { Toolbar, ToolbarContent, ToolbarIcon, ToolbarLink };
