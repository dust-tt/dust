import { RadioGroup, Transition } from "@headlessui/react";
import React, { createContext, useContext } from "react";

import { ChevronDownIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

interface OpenState {
  value: string;
  isSelected: boolean;
}

const OpenStateContext = createContext<OpenState | undefined>(undefined);

const useOpenState = (): OpenState => {
  const context = useContext(OpenStateContext);
  if (context === undefined) {
    throw new Error("useOpenState must be used within a OpenStateProvider");
  }
  return context;
};

export interface HorizontalCollapsibleProps {
  children: React.ReactNode;
  defaultValue?: string;
}

export interface HorizontalCollapsibleContentProps {
  children: React.ReactNode;
}

export interface HorizontalCollapsibleImageContainerProps {
  children: React.ReactNode;
}

export interface HorizontalCollapsibleItemProps {
  children: React.ReactNode;
  value: string;
}

export interface HorizontalCollapsibleImageProps {
  src: string;
  alt: string;
  className?: string;
  value: string;
}

export interface HorizontalCollapsibleButtonProps {
  label?: string;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  variant?: "primary" | "secondary";
}

export interface HorizontalCollapsiblePanelProps {
  children: React.ReactNode;
  className?: string;
}

export const HorizontalCollapsible: React.FC<HorizontalCollapsibleProps> & {
  Item: React.FC<HorizontalCollapsibleItemProps>;
  Button: React.FC<HorizontalCollapsibleButtonProps>;
  Panel: React.FC<HorizontalCollapsiblePanelProps>;
  Image: React.FC<HorizontalCollapsibleImageProps>;
  ImageContainer: React.FC<HorizontalCollapsibleImageContainerProps>;
  Content: React.FC<HorizontalCollapsibleContentProps>;
} = ({ children, defaultValue = "1" }) => (
  <RadioGroup defaultValue={defaultValue}>
    {({ value }) => (
      <OpenStateContext.Provider value={{ value, isSelected: false }}>
        <div className="s-flex s-flex-row s-gap-6">{children}</div>
      </OpenStateContext.Provider>
    )}
  </RadioGroup>
);

HorizontalCollapsible.ImageContainer = function ({
  children,
}: HorizontalCollapsibleImageContainerProps) {
  return (
    <div className="s-relative s-h-48 s-w-48 s-flex-shrink-0 s-overflow-hidden s-rounded-lg">
      {children}
    </div>
  );
};

HorizontalCollapsible.Content = function ({
  children,
}: HorizontalCollapsibleContentProps) {
  return (
    <div className="s-flex s-flex-grow s-flex-col s-gap-2">{children}</div>
  );
};

HorizontalCollapsible.Item = function ({
  children,
  value,
}: HorizontalCollapsibleItemProps) {
  return (
    <RadioGroup.Option value={value}>
      {({ checked }) => (
        <OpenStateContext.Provider value={{ value, isSelected: checked }}>
          <div
            className={classNames(
              "s-flex s-cursor-pointer s-flex-col s-gap-2 s-rounded-lg s-p-2",
              checked ? "s-bg-gray-50 dark:s-bg-gray-800" : ""
            )}
          >
            {children}
          </div>
        </OpenStateContext.Provider>
      )}
    </RadioGroup.Option>
  );
};

HorizontalCollapsible.Image = function ({
  src,
  alt,
  className = "",
  value,
}: HorizontalCollapsibleImageProps) {
  const { value: selectedValue } = useOpenState();
  const isSelected = value === selectedValue;

  return (
    <Transition
      show={isSelected}
      enter="s-transition s-duration-300 s-ease-out"
      enterFrom="s-opacity-0"
      enterTo="s-opacity-100"
      leave="s-transition s-duration-300 s-ease-out"
      leaveFrom="s-opacity-100"
      leaveTo="s-opacity-0"
      className="s-absolute s-inset-0"
    >
      <img
        src={src}
        alt={alt}
        className={classNames("s-h-full s-w-full s-object-cover", className)}
      />
    </Transition>
  );
};

HorizontalCollapsible.Button = function ({
  label,
  children,
  className = "",
  disabled = false,
  variant = "primary",
}: HorizontalCollapsibleButtonProps) {
  const { isSelected } = useOpenState();

  const labelClasses = {
    primary: {
      base: "s-text-action-500 s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
      hover: "group-hover/col:s-text-action-400",
      active: "active:s-text-action-600",
      dark: {
        base: "dark:s-text-action-500-dark",
        hover: "dark:group-hover/col:s-text-action-400-dark",
        active: "dark:active:s-text-action-600-dark",
        disabled: "dark:s-element-500-dark",
      },
      disabled: "s-element-500",
    },
    secondary: {
      base: "s-text-foreground s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
      hover: "group-hover/col:s-text-action-500",
      active: "active:s-text-action-600",
      dark: {
        base: "dark:s-text-foreground-dark",
        hover: "dark:group-hover/col:s-text-action-400-dark",
        active: "dark:active:s-text-action-600-dark",
        disabled: "dark:s-element-500-dark",
      },
      disabled: "s-element-500",
    },
  };

  const chevronClasses = {
    primary: {
      base: "s-text-element-600",
      hover: "group-hover/col:s-text-action-400",
      active: "active:s-text-action-700",
      disabled: "s-element-500",
      dark: {
        base: "dark:s-text-element-600-dark",
        hover: "dark:group-hover/col:s-text-action-500-dark",
        active: "dark:active:s-text-action-700-dark",
        disabled: "dark:s-element-500-dark",
      },
    },
    secondary: {
      base: "s-text-element-600",
      hover: "group-hover/col:s-text-action-400",
      active: "active:s-text-action-700",
      disabled: "s-element-500",
      dark: {
        base: "dark:s-text-element-600-dark",
        hover: "dark:group-hover/col:s-text-action-500-dark",
        active: "dark:active:s-text-action-700-dark",
        disabled: "dark:s-element-500-dark",
      },
    },
  };

  const finalLabelClasses = classNames(
    labelClasses[variant].base,
    labelClasses[variant].dark.base,
    !disabled ? labelClasses[variant].active : "",
    !disabled ? labelClasses[variant].dark.active : "",
    !disabled ? labelClasses[variant].hover : "",
    !disabled ? labelClasses[variant].dark.hover : "",
    disabled ? labelClasses[variant].disabled : ""
  );

  const finalChevronClasses = classNames(
    chevronClasses[variant].base,
    chevronClasses[variant].dark.base,
    !disabled ? chevronClasses[variant].active : "",
    !disabled ? chevronClasses[variant].dark.active : "",
    !disabled ? chevronClasses[variant].hover : "",
    !disabled ? chevronClasses[variant].dark.hover : "",
    disabled ? chevronClasses[variant].disabled : ""
  );

  return (
    <div
      className={classNames(
        disabled ? "s-cursor-default" : "s-cursor-pointer",
        className,
        "s-group/col s-flex s-items-center s-justify-items-center s-gap-1 s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0"
      )}
    >
      <Icon
        visual={isSelected ? ChevronDownIcon : ChevronRightIcon}
        size="sm"
        className={finalChevronClasses}
      />
      {children ? children : <span className={finalLabelClasses}>{label}</span>}
    </div>
  );
};

HorizontalCollapsible.Panel = function ({
  children,
  className = "",
}: HorizontalCollapsiblePanelProps) {
  const { isSelected } = useOpenState();

  return (
    <div className="s-flex-grow">
      <Transition
        show={isSelected}
        enter="s-transition s-duration-300 s-ease-out"
        enterFrom="s-transform s-scale-95 s-opacity-0"
      >
        <div className={className}>
          <div className="s-text-gray-500">{children}</div>
        </div>
      </Transition>
    </div>
  );
};
