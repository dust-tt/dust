import React, { ComponentType, MouseEvent, ReactNode } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { ChevronRight } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

const sizeClasses = {
  sm: "s-py-2 s-text-sm s-font-normal",
  md: "s-py-3 s-text-sm s-font-semibold",
};

const baseClasses =
  "s-group s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none s-text-sm";

const iconBaseClasses = "s-transition-colors s-ease-out s-duration-400";

const iconClasses = {
  default: {
    base: "s-text-element-600",
    hover: "group-hover:s-text-action-400",
    dark: {
      base: "dark:s-text-element-700-dark",
      hover: "dark:group-hover:s-text-action-500-dark",
    },
  },
  selected: {
    base: "s-text-action-400",
    hover: "",
    dark: {
      base: "dark:s-text-action-400-dark",
      hover: "",
    },
  },
};

const chevronClasses = {
  default: {
    base: "s-text-element-600",
    hover: "group-hover:s-text-action-400",
    dark: {
      base: "dark:s-text-element-600-dark",
      hover: "dark:group-hover:s-text-action-500-dark",
    },
  },
  selected: {
    base: "s-text-action-300",
    hover: "",
    active: "",
    dark: {
      base: "dark:s-text-action-300-dark",
      hover: "",
    },
    disabled: "",
  },
};

const stateClasses = {
  default: {
    base: "s-text-element-700 s-cursor-pointer",
    hover: "hover:s-text-element-800",
    active: "active:s-text-element-900",
    dark: {
      base: "dark:s-text-element-700-dark",
      hover: "dark:hover:s-text-element-800-dark",
      active: "dark:active:s-text-element-900-dark",
    },
    disabled: "s-opacity-50",
  },
  selected: {
    base: "s-text-action-500",
    hover: "",
    active: "",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "",
      active: "",
    },
    disabled: "",
  },
};

const stateClassesMD = {
  default: {
    base: "s-text-element-900 s-cursor-pointer",
    hover: "hover:s-text-action-500",
    active: "active:s-text-action-700",
    dark: {
      base: "dark:s-text-element-900-dark",
      hover: "dark:hover:s-text-action-400",
      active: "dark:active:s-text-action-600",
    },
    disabled: "s-opacity-50",
  },
  selected: {
    base: "s-text-action-500",
    hover: "",
    active: "",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "",
      active: "",
    },
    disabled: "",
  },
};

type ItemProps = {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  size?: "sm" | "md";
  variant?: "default" | "dropdown";
  selected?: boolean;
  disabled?: boolean;
  label: string;
  icon?: ComponentType;
  visual?: string | React.ReactNode;
  className?: string;
  href?: string;
};

export function Item({
  onClick,
  selected = false,
  size = "sm",
  disabled = false,
  variant = "default",
  label,
  icon,
  visual,
  className = "",
  href,
}: ItemProps) {
  const { components } = React.useContext(SparkleContext);

  const currentStateClasses =
    size === "md"
      ? selected
        ? stateClassesMD.selected
        : stateClassesMD.default
      : selected
      ? stateClasses.selected
      : stateClasses.default;
  const currentIconClasses = selected
    ? iconClasses.selected
    : iconClasses.default;

  const currentChevronClasses = selected
    ? chevronClasses.selected
    : chevronClasses.default;

  const itemClasses = classNames(
    baseClasses,
    sizeClasses[size],
    disabled ? "s-cursor-default" : currentStateClasses.base,
    disabled ? "s-cursor-default" : currentStateClasses.dark?.base,
    disabled ? currentStateClasses.disabled : "",
    !selected && !disabled ? currentStateClasses.hover : "",
    !selected && !disabled ? currentStateClasses.dark?.hover : "",
    !selected && !disabled ? currentStateClasses.active : "",
    !selected && !disabled ? currentStateClasses.dark?.active : "",
    className
  );

  const finalIconClasses = classNames(
    iconBaseClasses,
    currentIconClasses.base,
    !disabled ? currentIconClasses.hover : "", // Add condition here
    currentIconClasses.dark.base,
    !disabled ? currentIconClasses.dark.hover : "" // Add condition here
  );

  const finalCevronClasses = classNames(
    iconBaseClasses,
    "s-flex-shrink-0",
    size === "sm" ? "s-text-transparent" : currentChevronClasses.base,
    !disabled ? currentChevronClasses.hover : "", // Add condition here
    currentChevronClasses.dark.base,
    !disabled ? currentChevronClasses.dark.hover : "" // Add condition here
  );

  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  return (
    <Link
      className={itemClasses}
      onClick={selected || disabled ? undefined : onClick}
      aria-label={label}
      href={href || "#"}
    >
      {icon && <Icon visual={icon} className={finalIconClasses} />}
      {visual && <Avatar size="xs" visual={visual} />}
      <span className="s-grow s-truncate">{label}</span>

      {variant === "default" && (
        <Icon visual={ChevronRight} className={finalCevronClasses} size="sm" />
      )}
    </Link>
  );
}

interface EntryItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  label: string;
  icon?: ComponentType;
  className?: string;
  href?: string;
}

Item.Entry = function (props: EntryItemProps) {
  return <Item {...props} size="sm" variant="default" />;
};

interface AvatarItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  label: string;
  visual?: string | React.ReactNode;
  className?: string;
  href?: string;
}

Item.Avatar = function (props: AvatarItemProps) {
  return <Item2 {...props} style="action" />;
};

interface NavigationListItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  icon?: ComponentType;
  className?: string;
  href?: string;
}

Item.Navigation = function (props: NavigationListItemProps) {
  return <Item {...props} size="md" variant="default" />;
};

interface DropdownListItemProps {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  label: string;
  visual?: string | React.ReactNode;
  icon?: ComponentType;
  className?: string;
  href?: string;
}

Item.Dropdown = function (props: DropdownListItemProps) {
  return <Item {...props} size="md" variant="dropdown" />;
};

interface ListItemProps {
  children: ReactNode;
  className?: string;
}

interface ItemSectionHeaderProps {
  label: string;
  variant?: "primary" | "secondary";
}

Item.SectionHeader = function ({
  label,
  variant = "primary",
}: ItemSectionHeaderProps) {
  return (
    <div
      className={classNames(
        variant === "primary" ? "s-text-element-800" : "s-text-element-600",
        "s-pb-2 s-pt-6   s-text-xs s-font-medium s-uppercase"
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

type Item2Props = {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  style: "action" | "item";
  spacing?: "sm" | "md";
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  visual?: string | React.ReactNode | ComponentType;
  action?: ComponentType;
  actionOn?: "always" | "hover";
  className?: string;
  href?: string;
};

export function Item2({
  label,
  description,
  visual,
  style = "action",
  spacing = "sm",
  action = ChevronRight,
  onClick,
  selected = false,
  disabled = false,
  className = "",
  href,
}: Item2Props) {
  const { components } = React.useContext(SparkleContext);

  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  let visualElement: ReactNode;

  if (typeof visual === "string") {
    visualElement = <Avatar size={description ? "sm" : "xs"} visual={visual} />;
  } else if (typeof visual === "function") {
    visualElement = <Icon visual={visual} className={""} />;
  } else {
    visualElement = visual;
  }

  return (
    <Link
      className={classNames(
        "s-flex s-flex-row s-gap-3",
        spacingClasses[spacing],
        className
      )}
      onClick={selected || disabled ? undefined : onClick}
      aria-label={label}
      href={href || "#"}
    >
      {visualElement}
      <div className={classNames("s-flex s-flex-col s-gap-0")}>
        <div
          className={classNames(
            "s-grow s-truncate s-text-sm",
            labelStyleClasses[style]
          )}
        >
          {label}
        </div>
        <div className="s-grow s-truncate s-text-xs s-text-element-700">
          {description}
        </div>
      </div>

      <Icon visual={action} className={"s-shrink-0"} size="sm" />
    </Link>
  );
}

const labelStyleClasses = {
  item: "s-font-normal",
  action: "s-font-semibold text-element-900",
};

const spacingClasses = {
  sm: "s-py-2",
  md: "s-py-3",
};
