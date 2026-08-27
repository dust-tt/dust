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
import { Link01, XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

export type ToolbarVariant = "inline" | "overlay";

type ToolbarButtonSize = NonNullable<ButtonProps["size"]>;

const toolbarRootVariants = cva("inline-flex items-center", {
  variants: {
    variant: {
      overlay:
        "absolute left-0 top-0 z-10 justify-start gap-3 overflow-hidden rounded-xl bg-primary-50 py-1 pl-3 duration-700 ease-in-out",
      inline:
        "gap-2 rounded-full bg-linear-to-b from-white to-muted-background px-1.5 py-1 shadow-[0px_1px_4px_0px_rgba(0,0,0,0.12),0px_1px_0px_0px_rgba(0,0,0,0.08)] dark:from-stone-800 dark:to-stone-850 dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.06),0px_0px_0px_1px_rgba(0,0,0,0.4),0px_4px_8px_0px_rgba(0,0,0,0.3)]",
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
  /** "inline" sits within the editor flow; "overlay" renders a floating bubble menu (defaults to "inline"). */
  variant?: ToolbarVariant;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  scrollAreaClassName?: string;
  /** Makes the actions horizontally scrollable; defaults to true for the "overlay" variant. */
  scroll?: boolean;
  /** When provided, renders a leading close button and is called when it is clicked. */
  onClose?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Extra Button props for the close button (e.g. size, variant). */
  closeButtonProps?: Omit<ButtonProps, "icon" | "onClick" | "label">;
  /** Leading content rendered before the actions, replacing the close button. */
  startSlot?: React.ReactNode;
}

/**
 * A formatting toolbar for rich-text editing, typically driving a text editor's commands.
 * Use `variant` "inline" to sit within the editor flow or "overlay" for a floating bubble
 * menu, laying out actions with `ToolbarContent` groups, `ToolbarIcon` buttons, and
 * `ToolbarLink`. Use it to present text-formatting controls (bold, italic, lists, code,
 * links); for general page-level actions, use a `Bar` or `HoveringBar` instead.
 *
 * @summary Rich-text formatting toolbar.
 */
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
  /** Groups of related actions; a vertical separator is drawn between consecutive groups. */
  groups: readonly ToolbarContentGroup[];
  separatorClassName?: string;
}

/**
 * Lays out toolbar actions as `groups` separated by vertical dividers, so separators
 * fall in sensible places between related actions.
 *
 * @summary Grouped toolbar actions with separators.
 */
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
  /** Called when the button is clicked (the event is prevented and stopped for you). */
  onClick: () => void;
  size: ToolbarButtonSize;
  /** Whether the formatting is applied at the current selection; styles the button as active. */
  active?: boolean;
  tooltip?: string;
}

/**
 * An icon button for a toolbar action; set `active` to reflect the formatting applied at
 * the current selection, and provide a `tooltip` to keep the icon identifiable.
 *
 * @summary Toolbar icon button.
 */
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
  /** Controls whether the link-insertion dialog is open. */
  isOpen: boolean;
  /** Called when the dialog requests to open or close. */
  onOpenChange: (open: boolean) => void;
  /** Called when the link toolbar button is clicked, to open the dialog. */
  onOpenDialog: () => void;
  /** Called when the dialog's Save button is clicked. */
  onSubmit: () => void;
  linkText: string;
  linkUrl: string;
  /** Called with the new value when the link text input changes. */
  onLinkTextChange: (value: string) => void;
  /** Called with the new value when the link URL input changes. */
  onLinkUrlChange: (value: string) => void;
  size: ToolbarButtonSize;
  /** Whether a link is applied at the current selection. */
  active?: boolean;
  tooltip?: string;
}

/**
 * A link-insertion control for the toolbar: a link icon button paired with a controlled
 * dialog collecting the link text and URL. Own the dialog state via `isOpen` /
 * `onOpenChange` and apply the link in `onSubmit`.
 *
 * @summary Toolbar link-insertion control.
 */
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
