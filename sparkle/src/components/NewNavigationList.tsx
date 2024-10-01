import * as React from "react";

import { classNames, cn } from "@sparkle/lib/utils";

export const listStyleClasses = {
  container: "s-gap-0.5 s-flex s-flex-col s-overflow-hidden",
  item: classNames(
    "s-box-border s-w-full s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none",
    "s-rounded-md s-text-muted-foreground s-text-sm s-px-2 s-py-2",
    "s-transition-colors s-duration-300",
    "data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400",
    "hover:s-text-primary-950 hover:s-bg-white",
    "active:s-bg-primary-200 active:s-border-border"
  ),
  "item-selected": "s-text-primary-950 s-bg-white s-ring-1 s-ring-primary-200",
  label:
    "s-font-semibold s-px-2 s-pt-6 s-pb-2 s-text-xs s-text-foreground s-whitespace-nowrap s-overflow-hidden s-text-ellipsis",
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
>(({ className, selected, label, ...props }, ref) => (
  <div className={cn("s-px-2", className)} ref={ref} {...props}>
    <div
      className={cn(
        listStyleClasses.item,
        selected ? listStyleClasses["item-selected"] : ""
      )}
    >
      {label && (
        <span className="s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
          {" "}
          {label}{" "}
        </span>
      )}
    </div>
  </div>
));
NewNavigationListItem.displayName = "NewNavigationListItem";

const NewNavigationListLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(listStyleClasses.label, className)} {...props} />
));
NewNavigationListLabel.displayName = "NewNavigationListLabel";

export { NewNavigationList, NewNavigationListItem, NewNavigationListLabel };
