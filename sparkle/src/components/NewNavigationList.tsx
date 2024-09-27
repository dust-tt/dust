import * as React from "react";

import { classNames, cn } from "@sparkle/lib/utils";

export const listStyleClasses = {
  container: "s-gap-0.5 s-flex s-flex-col s-overflow-hidden",
  item: classNames(
    "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none",
    "s-rounded-md s-border s-border-transparent s-text-muted-foreground s-text-sm s-ml-2 s-mr-2 s-px-2 s-py-2",
    "s-transition-colors s-duration-300",
    "data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400",
    "hover:s-text-primary-950 hover:s-bg-primary-100",
    "active:s-bg-primary-200 active:s-border-border"
  ),
  "item-selected": "s-text-primary-950 s-bg-primary-100 s-border-primary-300",
  label: "s-font-semibold s-px-2 s-pt-6 s-pb-2 s-text-xs s-text-foreground",
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
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      listStyleClasses.item,
      selected ? listStyleClasses["item-selected"] : "",
      className
    )}
    {...props}
  />
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
