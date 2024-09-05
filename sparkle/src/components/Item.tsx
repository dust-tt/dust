import React, { ComponentType, MouseEvent, ReactNode } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

const labelStyleClasses = {
  item: "s-font-normal",
  action: "s-font-semibold",
  link: "s-font-semibold",
  warning: "s-font-semibold",
};

const labelColorClasses = {
  item: "s-text-element-600 dark:s-text-element-500-dark group-hover/item:s-text-action-500 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  action:
    "s-text-element-800 dark:s-text-element-800-dark group-hover/item:s-border-2 group-hover/item:s-text-action-500 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  link: "s-text-element-800 dark:s-text-element-800-dark group-hover/item:s-text-action-500 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  warning:
    "s-text-warning-500 dark:s-text-warning-400-dark group-hover/item:s-text-warning-400 group-active/item:s-text-warning-700 dark:group-hover/item:s-text-warning-600-dark dark:group-active/item:s-text-warning-400-dark",
};

const spacingClasses = {
  sm: "s-py-2 s-gap-x-2",
  md: "s-py-2.5 s-gap-x-3",
  lg: "s-py-3 s-gap-x-3",
};

const iconClasses = {
  item: "s-text-element-600 group-hover/item:s-text-action-400 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  action:
    "s-text-element-600 group-hover/item:s-text-action-400 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  link: "s-text-brand group-hover/item:s-text-action-400 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
  warning:
    "s-text-warning-400 group-hover/item:s-text-warning-300 group-active/item:s-text-warning-700 dark:group-hover/item:s-text-warning-600-dark dark:group-active/item:s-text-warning-400-dark",
};

type ItemProps = {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  style: "action" | "warning" | "item" | "link";
  spacing?: "sm" | "md" | "lg";
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  visual?: string | React.ReactNode;
  icon?: ComponentType;
  action?: ComponentType;
  hasAction?: boolean | "hover";
  className?: string;
  href?: string;
  target?: string;
};

export function Item({
  label,
  description,
  visual,
  icon,
  style = "action",
  spacing = "sm",
  action = ChevronRightIcon,
  hasAction = true,
  onClick,
  selected = false,
  disabled = false,
  className = "",
  href,
  target,
}: ItemProps) {
  const { components } = React.useContext(SparkleContext);

  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  let visualElement: React.ReactNode;

  if (visual) {
    visualElement = (
      <Avatar
        size={description ? "sm" : "xs"}
        visual={visual}
        disabled={disabled}
        clickable
      />
    );
  } else if (icon) {
    visualElement = (
      <Icon
        visual={icon}
        className={classNames(
          "s-transition-colors s-duration-200 s-ease-out",
          disabled
            ? "s-text-element-500 dark:s-text-element-500-dark"
            : selected
              ? "s-text-action-400 dark:s-text-action-600-dark"
              : iconClasses[style]
        )}
      />
    );
  }

  const targetProps = target ? { target } : {};

  console.log(">>> disabled:", disabled, label);

  return (
    <Link
      className={classNames(
        "s-duration-400 s-group/item s-box-border s-flex s-select-none s-text-sm s-transition-colors s-ease-out",
        spacingClasses[spacing],
        disabled ? "s-cursor-default" : "s-cursor-pointer",
        className
      )}
      onClick={selected || disabled ? undefined : onClick}
      aria-label={label}
      href={href || "#"}
      {...targetProps}
    >
      {visualElement}
      <div
        className={classNames(
          "s-flex s-grow s-flex-col s-gap-0 s-overflow-hidden"
        )}
      >
        <div
          className={classNames(
            "s-transition-colors s-duration-200 s-ease-out",
            "s-grow s-truncate s-text-sm",
            labelStyleClasses[style],
            disabled
              ? "s-text-element-600 dark:s-text-element-500-dark"
              : selected
                ? "s-text-action-500 dark:s-text-action-600-dark"
                : labelColorClasses[style]
          )}
        >
          {label}
        </div>
        <div
          className={classNames(
            "s-grow s-truncate s-text-xs",
            disabled
              ? "s-text-element-600 dark:s-text-element-500-dark"
              : "s-text-element-700 dark:s-text-element-600-dark"
          )}
        >
          {description}
        </div>
      </div>

      <Icon
        visual={action}
        className={
          hasAction
            ? classNames(
                "s-shrink-0 s-transition-all s-duration-200 s-ease-out",
                hasAction === "hover"
                  ? "s-opacity-0 group-hover/item:s-opacity-100"
                  : "",
                disabled
                  ? "s-text-element-500 dark:s-text-element-500-dark"
                  : selected
                    ? "s-text-action-400 s-opacity-100 dark:s-text-action-600-dark"
                    : classNames(
                        "s-text-element-600 group-hover/item:s-text-action-400 group-active/item:s-text-action-700 dark:group-hover/item:s-text-action-600-dark dark:group-active/item:s-text-action-400-dark",
                        hasAction ? "group-hover/item:s-opacity-100" : ""
                      )
              )
            : "s-hidden"
        }
        size="sm"
      />
    </Link>
  );
}

interface EntryItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  selected?: boolean;
  label: string;
  icon?: ComponentType;
  className?: string;
  href?: string;
}

Item.Entry = function (props: EntryItemProps) {
  return <Item {...props} spacing="sm" style="item" hasAction={"hover"} />;
};

interface AvatarItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  visual?: string | React.ReactNode;
  className?: string;
  hasAction?: boolean | "hover";
  href?: string;
}

Item.Avatar = function ({
  description,
  hasAction = false,
  ...otherProps
}: AvatarItemProps) {
  return (
    <Item
      {...otherProps}
      style="action"
      spacing={description ? "md" : "sm"}
      description={description}
      hasAction={hasAction}
    />
  );
};

interface NavigationListItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  icon?: ComponentType;
  className?: string;
  href?: string;
  target?: string;
  hasAction?: boolean | "hover";
  action?: ComponentType;
}

Item.Navigation = function (props: NavigationListItemProps) {
  return <Item {...props} style="action" spacing="md" />;
};

interface LinkItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  label: string;
  description?: string;
  visual?: string | React.ReactNode;
  icon?: ComponentType;
  className?: string;
  href?: string;
  target?: string;
}

Item.Link = function ({ ...props }: LinkItemProps) {
  return (
    <Item
      {...props}
      // Pass down additional props as needed
      style="link"
      hasAction={false}
      spacing="lg"
      // Add any conditions or logic for additional props
    />
  );
};

interface DropdownListItemProps {
  style?: "default" | "warning";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  visual?: string | React.ReactNode;
  icon?: ComponentType;
  className?: string;
  href?: string;
}

Item.Dropdown = function ({ style, ...props }: DropdownListItemProps) {
  return (
    <Item
      {...props}
      // Pass down additional props as needed
      style={style === "default" ? "action" : "warning"}
      hasAction={false}
      // Add any conditions or logic for additional props
    />
  );
};

interface ListItemProps {
  children: ReactNode;
  className?: string;
}

interface ItemSectionHeaderProps {
  label: string;
  className?: string;
  variant?: "primary" | "secondary";
}

Item.SectionHeader = function ({
  label,
  variant = "primary",
  className = "",
}: ItemSectionHeaderProps) {
  return (
    <div
      className={classNames(
        className,
        variant === "primary"
          ? "s-text-element-800 dark:s-text-element-800-dark"
          : "s-text-element-600 dark:s-text-element-600-dark",
        "s-pb-2 s-pt-6 s-text-xs s-font-medium s-uppercase"
      )}
    >
      {label}
    </div>
  );
};

Item.List = function ({ children, className }: ListItemProps) {
  return (
    <div className={classNames(className ? className : "", "s-flex")}>
      <div className={"s-flex s-w-full s-flex-col"}>{children}</div>
    </div>
  );
};
