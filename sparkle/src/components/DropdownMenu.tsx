import { Menu, Transition } from "@headlessui/react";
import React, {
  ComponentType,
  forwardRef,
  Fragment,
  JSXElementConstructor,
  MouseEvent,
  MutableRefObject,
  ReactElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
} from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Item as StandardItem, LinkProps } from "./Item";
import { Tooltip, TooltipProps } from "./Tooltip";

interface Position {
  x: number;
  y: number;
}

const DropdownMenuContext = React.createContext<{
  buttonRef?: MutableRefObject<HTMLButtonElement | null>;
  position?: Position;
  setPosition?: React.Dispatch<React.SetStateAction<Position | undefined>>;
}>({});

const labelClasses = {
  base: "s-text-element-900 s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
  hover: "group-hover/dm:s-text-action-500",
  active: "active:s-text-action-700",
  dark: {
    base: "dark:s-text-element-900-dark",
    hover: "dark:group-hover/dm:s-text-action-400",
    active: "dark:active:s-text-action-600",
    disabled: "dark:s-element-500-dark",
  },
  disabled: "s-opacity-50",
};

const labelSizeClasses = {
  sm: "s-text-sm",
  md: "s-text-base",
};

const iconClasses = {
  base: "s-text-element-700 s-transition-colors s-ease-out s-duration-400",
  hover: "group-hover/dm:s-text-action-500",
  active: "active:s-text-action-700",
  disabled: "s-opacity-50",
  dark: {
    base: "dark:s-text-element-700-dark",
    hover: "dark:group-hover/dm:s-text-action-500-dark",
    active: "dark:active:s-text-action-600",
  },
};

const chevronClasses = {
  base: "s-text-element-600 s-mt-0.5",
  hover: "group-hover/dm:s-text-action-400",
  disabled: "s-element-500",
  dark: {
    base: "dark:s-text-element-600-dark",
    hover: "dark:group-hover/dm:s-text-action-500-dark",
    disabled: "dark:s-element-500-dark",
  },
};

export interface DropdownMenuProps {
  className?: string;
  children:
    | React.ReactNode
    | (({
        open,
        close,
      }: {
        open: boolean;
        close: () => void;
      }) => ReactElement<unknown, string | JSXElementConstructor<unknown>>);
}

export function DropdownMenu({ children, className = "" }: DropdownMenuProps) {
  const buttonRef = useRef(null);
  const [position, setPosition] = useState<Position | undefined>();
  return (
    <DropdownMenuContext.Provider value={{ buttonRef, position, setPosition }}>
      <Menu
        as="div"
        className={classNames(className, "s-relative s-inline-block")}
      >
        {children}
      </Menu>
    </DropdownMenuContext.Provider>
  );
}

export interface DropdownContextMenuProps {}

export interface DropdownContextMenuRef {
  open: (e: MouseEvent) => void;
}

DropdownMenu.ContextMenu = forwardRef<
  DropdownContextMenuRef,
  DropdownContextMenuProps
>((_, ref) => {
  const { buttonRef, setPosition } = useContext(DropdownMenuContext);

  useImperativeHandle(ref, () => ({
    open: (e: MouseEvent) => {
      e.preventDefault();
      if (buttonRef?.current) {
        // If menu is not open yet, set position - otherwise - just send click event
        if (setPosition && !buttonRef.current.dataset.headlessuiState) {
          setPosition({ x: e.clientX, y: e.clientY });
        }
        buttonRef.current.click();
      }
    },
  }));

  return false;
});

export interface DropdownButtonProps {
  label?: string;
  type?: "menu" | "submenu" | "select";
  size?: "sm" | "md";
  tooltip?: string;
  tooltipPosition?: TooltipProps["position"];
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
  onClick?: () => void;
}

DropdownMenu.Button = forwardRef<HTMLButtonElement, DropdownButtonProps>(
  function DropdownMenuButton(
    {
      label,
      type = "menu",
      size = "sm",
      tooltip,
      icon,
      children,
      tooltipPosition = "above",
      className = "",
      disabled = false,
      onClick,
    },
    forwardedRef
  ) {
    const { buttonRef, setPosition } = useContext(DropdownMenuContext);

    const finalLabelClasses = classNames(
      labelClasses.base,
      labelSizeClasses[size],
      labelClasses.dark.base,
      !disabled ? labelClasses.active : "",
      !disabled ? labelClasses.dark.active : "",
      !disabled ? labelClasses.hover : "",
      !disabled ? labelClasses.dark.hover : "",
      disabled ? labelClasses.disabled : ""
    );

    const finalIconClasses = classNames(
      iconClasses.base,
      iconClasses.dark.base,
      !disabled ? iconClasses.hover : "",
      !disabled ? iconClasses.dark.hover : "",
      disabled ? iconClasses.disabled : ""
    );

    const finalChevronClasses = classNames(
      chevronClasses.base,
      !disabled ? chevronClasses.hover : "",
      chevronClasses.dark.base,
      !disabled ? chevronClasses.dark.hover : "",
      disabled ? chevronClasses.disabled : ""
    );

    const aggregatedRef = (value: HTMLButtonElement) => {
      if (buttonRef) {
        buttonRef.current = value;
      }

      if (typeof forwardedRef === "function") {
        forwardedRef(value);
      } else if (forwardedRef) {
        forwardedRef.current = value;
      }
    };

    const clickHandler = (e: MouseEvent) => {
      e.stopPropagation();
      if (onClick) {
        onClick();
      }

      // Reset position in case of standard (non context-menu) button click
      const button = buttonRef?.current;
      if (button) {
        // clientX and clientY are 0 in case of generated react synthetic event like the one generated by buttonRef.current.click()
        const isRealClick = Boolean(e.clientX && e.clientY);
        const isCurrentlyOpen = Boolean(button.dataset?.headlessuiState);

        if (setPosition && isRealClick && !isCurrentlyOpen) {
          setPosition(undefined);
        }
      }
    };

    if (children) {
      return (
        <Menu.Button
          as="div"
          disabled={disabled}
          ref={aggregatedRef}
          className={classNames(
            disabled ? "s-cursor-default" : "s-cursor-pointer",
            className,
            "s-group/dm s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
            label ? "s-gap-1.5" : "s-gap-0"
          )}
          onClick={clickHandler}
        >
          {tooltip ? (
            <Tooltip position={tooltipPosition} label={tooltip}>
              {children}
            </Tooltip>
          ) : (
            children
          )}
        </Menu.Button>
      );
    }

    const chevronIcon =
      type === "select"
        ? ChevronUpDownIcon
        : type === "submenu"
          ? ChevronRightIcon
          : ChevronDownIcon;

    return (
      <>
        {tooltip ? (
          <Tooltip label={tooltip} position={tooltipPosition}>
            <Menu.Button
              disabled={disabled}
              ref={aggregatedRef}
              className={classNames(
                disabled ? "s-cursor-default" : "s-cursor-pointer",
                className,
                "s-group/dm s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
                label ? (size === "md" ? "s-gap-2" : "s-gap-1.5") : "s-gap-0.5"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) {
                  onClick();
                }
              }}
            >
              <Icon visual={icon} size={size} className={finalIconClasses} />
              <Icon
                visual={chevronIcon}
                size={size === "sm" ? "xs" : "sm"}
                className={finalChevronClasses}
              />
            </Menu.Button>
          </Tooltip>
        ) : (
          <Menu.Button
            disabled={disabled}
            ref={aggregatedRef}
            className={classNames(
              disabled ? "s-cursor-default" : "s-cursor-pointer",
              className,
              "s-group/dm s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
              label ? (size === "md" ? "s-gap-2" : "s-gap-1.5") : "s-gap-0.5",
              type === "submenu" ? "s-opacity-50" : ""
            )}
            onClick={clickHandler}
          >
            <Icon visual={icon} size={size} className={finalIconClasses} />
            <span
              className={classNames(
                finalLabelClasses,
                type === "submenu" ? "s-w-full" : ""
              )}
            >
              {label}
            </span>
            <Icon
              visual={chevronIcon}
              size={size === "sm" ? "xs" : "sm"}
              className={finalChevronClasses}
            />
          </Menu.Button>
        )}
      </>
    );
  }
);

export interface DropdownItemProps {
  children?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  hasChildren?: boolean;
  icon?: ComponentType;
  label: string;
  link?: LinkProps;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  selected?: boolean;
  variant?: "default" | "warning";
  visual?: string | React.ReactNode;
}

DropdownMenu.Item = function ({
  variant = "default",
  label,
  description,
  link,
  disabled,
  visual,
  icon,
  onClick,
  hasChildren,
  children,
  selected = false,
}: DropdownItemProps) {
  return (
    // need to use as="div" -- otherwise we get a "forwardRef" error in the console
    <Menu.Item disabled={disabled} as="div">
      {hasChildren ? (
        <DropdownMenu className="s-w-full s-gap-x-2 s-py-2">
          <DropdownMenu.Button
            className="s-w-full"
            disabled={disabled}
            label={label}
            type="submenu"
          />
          {children}
        </DropdownMenu>
      ) : (
        <StandardItem.Dropdown
          className="s-w-full"
          description={description}
          disabled={disabled}
          link={link}
          icon={icon}
          label={label}
          onClick={onClick}
          selected={selected}
          style={variant}
          visual={visual}
        />
      )}
    </Menu.Item>
  );
};

interface DropdownSectionHeaderProps {
  label: string;
}

DropdownMenu.SectionHeader = function ({ label }: DropdownSectionHeaderProps) {
  return (
    // need to use as="div" -- otherwise we get a "forwardRef" error in the console
    <Menu.Item as="div">
      <div
        className={classNames(
          "s-w-full",
          "s-text-element-600 dark:s-text-element-600-dark",
          "s-pb-3 s-pt-4 s-text-xs s-font-medium s-uppercase"
        )}
      >
        {label}
      </div>
    </Menu.Item>
  );
};

type ItemsVariantType = "default" | "no-padding";

const classNamesForVariant = (
  variant: ItemsVariantType,
  hasDropdownItem: boolean
) => {
  switch (variant) {
    case "no-padding":
      return "";

    case "default":
      return `s-px-5 ${hasDropdownItem ? "s-py-1.5" : "s-py-4"}`;
  }
};

interface DropdownItemsProps {
  origin?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "auto";
  width?: number;
  marginLeft?: number;
  children: React.ReactNode;
  topBar?: React.ReactNode;
  bottomBar?: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  overflow?: "visible" | "auto";
  variant?: ItemsVariantType;
}

DropdownMenu.Items = function ({
  origin = "auto",
  width = 160,
  marginLeft,
  children,
  topBar,
  bottomBar,
  onKeyDown,
  overflow = "auto",
  variant = "default",
}: DropdownItemsProps) {
  const { buttonRef, position } = useContext(DropdownMenuContext);
  const [buttonHeight, setButtonHeight] = useState(0);

  if (origin === "auto") {
    origin = position
      ? findOriginFromPosition(position)
      : findOriginFromButton(buttonRef);
  }
  useEffect(() => {
    if (buttonRef && buttonRef.current) {
      setButtonHeight(buttonRef.current.offsetHeight);
    }
  }, []);

  // Check if any child is a Dropdown.Item
  const hasDropdownItem = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      (child.type === DropdownMenu.Item || child.props?.hasChildren)
  );

  const getOriginClass = (origin: string) => {
    switch (origin) {
      case "topLeft":
        return `s-origin-top-left s-left-0`;
      case "topRight":
        return `s-origin-top-right s-right-0`;
      case "bottomLeft":
        return "s-origin-bottom-left s-left-0 s-bottom-6";
      case "bottomRight":
        return "s-origin-bottom-right s-right-0 s-bottom-6";
      default:
        return "s-origin-top-right";
    }
  };

  const getOriginTransClass = (origin: string) => {
    switch (origin) {
      case "topLeft":
        return "s-transform s-opacity-0 s-scale-95 -s-translate-y-5";
      case "topRight":
        return "s-transform s-opacity-0 s-scale-95 -s-translate-y-5";
      case "bottomLeft":
        return "s-transform s-opacity-0 s-scale-95 s-translate-y-5";
      case "bottomRight":
        return "s-transform s-opacity-0 s-scale-95 s-translate-y-5";
      default:
        return "s-origin-top-right";
    }
  };

  const getOverflowClass = (overflow: string) => {
    switch (overflow) {
      case "visible":
        return "s-overflow-visible";
      case "auto":
        return "s-max-h-[344px] s-overflow-auto";
      default:
        return "s-max-h-[344px] s-overflow-auto";
    }
  };

  const styleInsert = (origin: string, marginLeft?: number) => {
    const style: {
      width: string;
      top?: string;
      bottom?: string;
      left?: string;
      right?: string;
    } = {
      width: `${width}px`,
    };

    if (position && buttonRef?.current) {
      const buttonRect = buttonRef?.current?.getBoundingClientRect();

      if (buttonRect && (origin === "topRight" || origin === "topLeft")) {
        style["top"] = `${Math.abs(buttonRect.top - position.y)}px`;
      }
      if (buttonRect && (origin === "bottomRight" || origin === "bottomLeft")) {
        style["bottom"] = `${Math.abs(buttonRect.top - position.y)}px`;
      }
      if (buttonRect && (origin === "bottomRight" || origin === "topRight")) {
        style["right"] =
          `${Math.abs(buttonRect.right - position.x + (marginLeft ?? 0))}px`;
      }
      if (buttonRect && (origin === "bottomLeft" || origin === "topLeft")) {
        style["left"] = `${position.x - buttonRect.left + (marginLeft ?? 0)}px`;
      }
      return style;
    }

    if (marginLeft) {
      style["left"] = `${marginLeft}px`;
    }

    if (origin === "topLeft" || origin === "topRight") {
      style["top"] = `${buttonHeight + 8}px`;
    }

    return style;
  };

  return (
    <Transition
      as={Fragment}
      enter="s-transition s-ease-out s-duration-200"
      enterFrom={getOriginTransClass(origin)}
      enterTo="s-transform s-opacity-100 s-scale-100 s-translate-y-0"
      leave="s-transition s-ease-in s-duration-75"
      leaveFrom="s-transform s-opacity-100 s-scale-100 s-translate-y-0"
      leaveTo={getOriginTransClass(origin)}
    >
      <Menu.Items
        onKeyDown={onKeyDown}
        className={classNames(
          "s-absolute s-z-10",
          getOriginClass(origin),
          "s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-shadow-lg focus:s-outline-none dark:s-border-structure-100-dark dark:s-bg-structure-0-dark"
        )}
        onClick={(e) => e.stopPropagation()}
        style={styleInsert(origin, marginLeft)}
      >
        {topBar}
        <div
          className={classNames(
            classNamesForVariant(variant, hasDropdownItem),
            getOverflowClass(overflow)
          )}
        >
          <StandardItem.List>{children}</StandardItem.List>
        </div>
        {bottomBar}
      </Menu.Items>
    </Transition>
  );
};

function findOriginFromPosition(position?: Position) {
  if (!position) {
    return "topRight";
  }

  const windowHeight = window.innerHeight;
  // Top half of screen
  if (position.y < windowHeight / 2) {
    return position.x < window.innerWidth / 2 ? "topLeft" : "topRight";
  }
  // Bottom half of screen
  return position.x < window.innerWidth / 2 ? "bottomLeft" : "bottomRight";
}

function findOriginFromButton(
  buttonRef: MutableRefObject<HTMLButtonElement | null> | undefined
) {
  if (!buttonRef?.current) {
    return "topRight";
  }
  const buttonRect = buttonRef.current?.getBoundingClientRect();
  if (!buttonRect) {
    return "topRight";
  }

  return findOriginFromPosition({ x: buttonRect.left, y: buttonRect.top });
}
