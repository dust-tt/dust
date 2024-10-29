import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Button,
  Icon,
  LinkWrapper,
  LinkWrapperProps,
} from "@sparkle/components/";
import { MoreIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const listStyles = cva("s-flex", {
  variants: {
    layout: {
      container: "s-gap-1 s-flex-col s-overflow-hidden",
      item: cn(
        "s-box-border s-items-center s-w-full s-flex s-gap-1.5 s-cursor-pointer s-select-none s-items-center s-outline-none s-rounded-xl s-text-sm s-px-3 s-py-2 s-transition-colors s-duration-300",
        "data-[disabled]:s-pointer-events-none data-[disabled]:s-text-muted-foreground",
        "hover:s-text-foreground hover:s-bg-structure-150"
      ),
    },
    state: {
      active: "active:s-bg-structure-200",
      selected: "s-text-foreground s-font-medium s-bg-structure-150",
      unselected: "s-text-muted-foreground",
    },
  },
  defaultVariants: {
    layout: "container",
    state: "unselected",
  },
});

const labelStyles = cva(
  "s-font-semibold s-pt-6 s-pb-2 s-text-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis"
);

const NavigationList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(listStyles({ layout: "container" }), className)}
    {...props}
  />
));
NavigationList.displayName = "NavigationList";

interface NavigationListItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<LinkWrapperProps, "children" | "className"> {
  selected?: boolean;
  label?: string;
  icon?: React.ComponentType;
  showMoreIcon?: boolean;
}

const NavigationListItem = React.forwardRef<
  HTMLDivElement,
  NavigationListItemProps
>(
  (
    {
      className,
      selected,
      label,
      icon,
      href,
      target,
      rel,
      replace,
      shallow,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isPressed, setIsPressed] = React.useState(false);

    const handleMouseDown = (event: React.MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".new-button-class")) {
        setIsPressed(true);
      }
    };

    const content = (
      <div className={className} ref={ref} {...props}>
        <div
          className={listStyles({
            layout: "item",
            state: selected ? "selected" : isPressed ? "active" : "unselected",
          })}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            setIsPressed(false);
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={() => setIsPressed(false)}
        >
          {icon && <Icon visual={icon} size="sm" />}
          {label && (
            <span className="s-grow s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
              {label}
            </span>
          )}
          {isHovered && (
            <div className="-s-mr-2 s-flex s-h-4 s-items-center">
              <Button
                variant="ghost"
                icon={MoreIcon}
                size="xs"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </div>
    );

    return (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
        className={className}
      >
        {content}
      </LinkWrapper>
    );
  }
);
NavigationListItem.displayName = "NavigationListItem";

const variantStyles = cva("", {
  variants: {
    variant: {
      primary: "s-text-foreground",
      secondary: "s-text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

interface NavigationListLabelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof variantStyles> {
  label: string;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(({ className, variant, label, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(labelStyles(), variantStyles({ variant }), className)}
    {...props}
  >
    {label}
  </div>
));

NavigationListLabel.displayName = "NavigationListLabel";

export { NavigationList, NavigationListItem, NavigationListLabel };
