import { Disclosure, Transition } from "@headlessui/react";
import React, { createContext, useContext } from "react";

import { ChevronDownIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

const OpenStateContext = createContext<boolean | undefined>(undefined);

const useOpenState = (): boolean => {
  const context = useContext(OpenStateContext);
  if (context === undefined) {
    throw new Error("useOpenState must be used within a OpenStateProvider");
  }
  return context;
};

export interface CollapsibleProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const Collapsible: React.FC<CollapsibleProps> & {
  Button: React.FC<CollapsibleButtonProps>;
  Panel: React.FC<CollapsiblePanelProps>;
} = ({ children, defaultOpen }) => (
  <Disclosure defaultOpen={defaultOpen}>
    {({ open }) => (
      <OpenStateContext.Provider value={open}>
        {children}
      </OpenStateContext.Provider>
    )}
  </Disclosure>
);

export interface CollapsibleButtonProps {
  label?: string;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  variant?: "primary" | "secondary";
}
Collapsible.Button = function ({
  label,
  children,
  className = "",
  disabled = false,
  variant = "primary",
}: CollapsibleButtonProps) {
  const open = useOpenState();

  const labelClasses = {
    primary: {
      base: "s-text-action-500 dark:s-text-action-500-night s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
      hover:
        "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
      active: "active:s-text-action-600 dark:active:s-text-action-600-night",
      disabled: "s-element-500 dark:s-element-500-night",
    },

    secondary: {
      base: "s-text-foreground dark:s-text-foreground-night s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
      hover:
        "group-hover/col:s-text-action-500 dark:group-hover/col:s-text-action-500-night",
      active: "active:s-text-action-600 dark:active:s-text-action-600-night",
      disabled: "s-element-500 dark:s-element-500-night",
    },
  };

  const chevronClasses = {
    primary: {
      base: "s-text-element-600 dark:s-text-element-600-night",
      hover:
        "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
      active: "active:s-text-action-700 dark:active:s-text-action-700-night",
      disabled: "s-element-500 dark:s-element-500-night",
    },
    secondary: {
      base: "s-text-element-600 dark:s-text-element-600-night",
      hover:
        "group-hover/col:s-text-action-400 dark:group-hover/col:s-text-action-400-night",
      active: "active:s-text-action-700 dark:active:s-text-action-700-night",
      disabled: "s-element-500 dark:s-element-500-night",
    },
  };

  const finalLabelClasses = classNames(
    labelClasses[variant].base,
    !disabled ? labelClasses[variant].active : "",
    !disabled ? labelClasses[variant].hover : "",
    disabled ? labelClasses[variant].disabled : ""
  );

  const finalChevronClasses = classNames(
    chevronClasses[variant].base,
    !disabled ? chevronClasses[variant].active : "",
    !disabled ? chevronClasses[variant].hover : "",
    disabled ? chevronClasses[variant].disabled : ""
  );

  return (
    <Disclosure.Button
      disabled={disabled}
      className={classNames(
        disabled ? "s-cursor-default" : "s-cursor-pointer",
        className,
        "s-group/col s-flex s-items-center s-justify-items-center s-gap-1 s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0"
      )}
    >
      <Icon
        visual={open ? ChevronDownIcon : ChevronRightIcon}
        size="sm"
        className={finalChevronClasses}
      />
      {children ? children : <span className={finalLabelClasses}>{label}</span>}
    </Disclosure.Button>
  );
};

export interface CollapsiblePanelProps {
  children: React.ReactNode;
  open?: boolean;
}

Collapsible.Panel = ({ children }: CollapsiblePanelProps) => (
  <Transition
    enter="s-transition s-duration-300 s-ease-out"
    enterFrom="s-transform s-scale-95 s-opacity-0"
    enterTo="s-transform s-scale-100 s-opacity-100"
    leave="s-transition s-duration-300 s-ease-out"
    leaveFrom="s-transform s-scale-100 s-opacity-100"
    leaveTo="s-transform s-scale-95 s-opacity-0"
  >
    <Disclosure.Panel>
      <div className="dark:s-text-primary-500-night s-text-primary-500">
        {children}
      </div>
    </Disclosure.Panel>
  </Transition>
);
