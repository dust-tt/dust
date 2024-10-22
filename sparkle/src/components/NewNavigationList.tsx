import * as React from "react";

import { NewButton } from "@sparkle/components/";
import { MoreIcon } from "@sparkle/icons";
import { classNames, cn } from "@sparkle/lib/utils";

export const listStyleClasses = {
  container: "s-gap-0.5 s-flex s-flex-col s-overflow-hidden",
  item: classNames(
    "s-box-border s-items-center s-w-full s-flex s-gap-1 s-cursor-pointer s-select-none s-items-center s-outline-none",
    "s-rounded-lg s-text-muted-foreground s-text-sm s-px-2 s-py-2",
    "s-transition-colors s-duration-300",
    "data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400",
    "hover:s-text-primary-950 hover:s-bg-white"
  ),
  "item-active": "s-bg-primary-200 s-border-border",
  "item-selected": "s-text-primary-950 s-bg-white s-ring-1 s-ring-primary-200",
  label:
    "s-font-semibold s-px-2 s-pt-6 s-pb-2 s-text-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis",
};

const NewNavigationList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(listStyleClasses.container, className)}
    {...props}
  />
));
NewNavigationList.displayName = "NewNavigationList";

const NewNavigationListItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean; label?: string }
>(({ className, selected, label, ...props }, ref) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  const handleMouseDown = (event: React.MouseEvent) => {
    // Check if the mouse down is on the button or inside the button
    if ((event.target as HTMLElement).closest(".new-button-class")) {
      // Do nothing if the click originated from the button
    } else {
      setIsPressed(true);
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
  };

  return (
    <div className={cn("s-px-2", className)} ref={ref} {...props}>
      <div
        className={cn(
          listStyleClasses.item,
          selected ? listStyleClasses["item-selected"] : "",
          isPressed ? listStyleClasses["item-active"] : ""
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {label && (
          <span className="s-grow s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
            {label}
          </span>
        )}
        {isHovered && (
          <div className="-s-mr-1 s-flex s-h-4 s-items-center">
            <NewButton
              variant="ghost"
              icon={MoreIcon}
              size="xs"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className="new-button-class"
            />
          </div>
        )}
      </div>
    </div>
  );
});
NewNavigationListItem.displayName = "NewNavigationListItem";

const variantClasses = {
  primary: "s-text-foreground",
  secondary: "s-text-muted-foreground",
};

interface NewNavigationListLabelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variantClasses;
  label: string;
}

const NewNavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NewNavigationListLabelProps
>(({ className, variant = "primary", label, ...props }, ref) => {
  const variantClass = variantClasses[variant];

  return (
    <div
      ref={ref}
      className={cn(listStyleClasses.label, variantClass, className)}
      {...props}
    >
      {label}
    </div>
  );
});

NewNavigationListLabel.displayName = "NewNavigationListLabel";

export { NewNavigationList, NewNavigationListItem, NewNavigationListLabel };
