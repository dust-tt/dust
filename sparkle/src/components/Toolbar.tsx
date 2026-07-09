import {
  LegacyButton,
  type LegacyButtonProps,
} from "@sparkle/components/Button";
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
import { Link01, XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

export type ToolbarVariant = "inline" | "overlay";

type ToolbarButtonSize = NonNullable<LegacyButtonProps["size"]>;

const toolbarRootVariants = cva("inline-flex items-center", {
  variants: {
    variant: {
      overlay:
        "absolute left-0 top-0 z-10 justify-start gap-3 overflow-hidden rounded-xl bg-primary-50 py-1 pl-3 duration-700 ease-in-out",
      inline:
        "gap-1 border-b border-t border-border bg-background p-1 sm:rounded-2xl sm:border sm:border-border/50 sm:shadow-md",
    },
  },
  defaultVariants: {
    variant: "inline",
  },
});

const toolbarContentVariants = cva("", {
  variants: {
    variant: {
      overlay: "flex h-full w-max flex-row items-center gap-3 px-3",
      inline: "inline-flex items-center gap-1",
    },
    scrollable: {
      true: "overflow-x-scroll",
      false: "",
    },
  },
  defaultVariants: {
    variant: "inline",
    scrollable: false,
  },
});

const toolbarScrollAreaVariants = cva("h-full w-full", {
  variants: {
    variant: {
      overlay: "border-l border-border",
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
  closeButtonProps?: Omit<LegacyButtonProps, "icon" | "onClick" | "label">;
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

  // Wrap cva output in cn() so tailwind-merge collapses conflicting utilities
  // (e.g. a consumer passing `hidden` overrides the base `inline-flex`). Matches
  // Button.tsx's `cn(buttonVariants({ ... }))` pattern. Without it both classes
  // survive and Tailwind's source order decides — `inline-flex` would win.
  const rootClassName = cn(toolbarRootVariants({ variant, className }));
  const contentBaseClassName = cn(
    toolbarContentVariants({
      variant,
      scrollable: isScrollable,
      className: contentClassName,
    })
  );
  const scrollAreaClassNames = cn(
    toolbarScrollAreaVariants({
      variant,
      className: scrollAreaClassName,
    })
  );

  function renderCloseButton(): JSX.Element | null {
    if (!onClose) {
      return null;
    }

    const buttonProps = {
      variant: closeVariant,
      icon: XClose,
      onClick: onClose,
      ...restCloseButtonProps,
    };

    if (closeButtonSize === "mini") {
      return <LegacyButton size="icon" {...buttonProps} />;
    }

    return <LegacyButton size={closeButtonSize} {...buttonProps} />;
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
              className={cn("my-1", separatorClassName)}
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
      <LegacyButton
        tooltip={tooltip}
        icon={icon}
        onClick={handleClick}
        size="icon"
        variant={active ? "ghost" : "ghost-secondary"}
      />
    );
  }

  return (
    <LegacyButton
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
        icon={Link01}
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
