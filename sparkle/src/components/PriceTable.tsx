import React, { ReactNode } from "react";

import { CheckIcon, DashIcon, XMarkIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

interface PriceTableProps {
  title: string;
  price: string;
  priceLabel?: string;
  color?: "pink" | "sky" | "emerald" | "amber" | "blue";
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
  magnified?: boolean;
}

const colorTable = {
  pink: "s-bg-gradient-to-r s-from-pink-400 s-to-red-300 dark:s-bg-pink-500",
  amber:
    "s-bg-gradient-to-r s-from-amber-400 s-to-yellow-300 s-bg-amber-400 dark:s-bg-amber-500",
  sky: "s-bg-gradient-to-r s-from-sky-400 s-to-blue-400 s-bg-sky-400 dark:s-bg-sky-500",
  blue: "s-bg-gradient-to-r s-from-blue-400 s-to-indigo-300 s-bg-blue-400 dark:s-bg-blue-500",
  emerald:
    "s-bg-gradient-to-r s-from-emerald-400 s-to-green-400 s-bg-emerald-400 dark:s-bg-emerald-500",
};

const textColorTable = {
  pink: "s-text-pink-900 dark:s-text-pink-950",
  amber: "s-text-amber-900 dark:s-text-amber-950",
  sky: "s-text-sky-900 dark:s-text-sky-950",
  blue: "s-text-blue-900 dark:s-text-blue-950",
  emerald: "s-text-emerald-900 dark:s-text-emerald-950",
};

const sizeTable = {
  sm: "s-rounded-2xl s-p-px s-shadow-2xl",
  xs: "s-rounded-2xl s-p-px s-shadow-xl",
};

export function PriceTable({
  title,
  price,
  color = "pink",
  size = "xs",
  priceLabel = "",
  className = "",
  magnified = true,
  children, // Use children instead of tableItems
}: PriceTableProps) {
  // Pass size prop to all PriceTable.Item children
  const childrenWithProps = React.Children.map(children, (child) => {
    // Checking isValidElement is the safe way and avoids a typescript error too
    if (React.isValidElement<PriceTableItemProps>(child)) {
      if (
        child.type === PriceTable.Item ||
        child.type === PriceTable.ActionContainer
      ) {
        return React.cloneElement(child, { size: size });
      }
    }
    return child;
  });

  return (
    <div
      className={classNames(
        "s-w-full",
        "s-flex s-cursor-default s-flex-col s-border s-border-white/30",
        sizeTable[size],
        magnified
          ? "s-duration-400 s-scale-95 s-transition-all s-ease-out hover:s-scale-100"
          : "",
        colorTable[color],
        className
      )}
    >
      <div
        className={classNames(
          "s-flex s-flex-col",
          size === "xs" ? "s-px-4 s-py-3" : "s-px-5 s-py-4"
        )}
      >
        <div
          className={classNames(
            size === "xs" ? "s-text-2xl" : "s-text-3xl",
            "s-w-full s-text-right s-font-semibold",
            "s-text-structure-0"
          )}
        >
          {title}
        </div>
        <div className="-s-mt-2 s-flex s-flex-row s-items-baseline s-gap-2">
          <span
            className={classNames(
              size === "xs" ? "s-text-3xl" : "s-text-4xl",
              textColorTable[color],
              "s-font-bold"
            )}
          >
            {price}
          </span>
          <span
            className={classNames(
              "s-font-bold s-text-white/70",
              size === "xs" ? "s-text-base" : "s-text-lg"
            )}
          >
            {priceLabel}
          </span>
        </div>
      </div>
      <div
        style={{
          borderBottomRightRadius: "15px",
          borderBottomLeftRadius: "15px",
          borderTopRightRadius: "4px",
          borderTopLeftRadius: "4px",
        }}
        className={classNames(
          "s-flex s-h-full s-flex-col s-overflow-hidden s-shadow-md",
          "s-bg-white dark:s-bg-structure-50-dark"
        )}
      >
        {childrenWithProps}
      </div>
    </div>
  );
}

const iconTable = {
  check: CheckIcon,
  dash: DashIcon,
  xmark: XMarkIcon,
};

const iconColorTable = {
  check: "s-text-emerald-500",
  dash: "s-text-amber-500",
  xmark: "s-text-red-500",
};

interface PriceTableItemProps {
  label: ReactNode;
  size?: "xs" | "sm";
  variant?: "check" | "dash" | "xmark";
  className?: string;
}

PriceTable.Item = function ({
  label,
  variant = "check",
  size = "xs",
  className = "",
}: PriceTableItemProps) {
  return (
    <div
      className={classNames(
        size === "xs"
          ? "s-gap-2 s-p-2.5 s-text-sm"
          : "s-gap-3 s-p-4 s-text-base",
        "s-flex s-items-start s-border-b",
        "s-border-structure-100 s-text-element-800",
        "dark:s-border-structure-200-dark/50 dark:s-text-element-800-dark",
        className
      )}
    >
      <div className="s-pt-0.5">
        <Icon
          size={size}
          visual={iconTable[variant]}
          className={iconColorTable[variant]}
        />
      </div>
      <div
        className={classNames(
          variant === "xmark"
            ? "s-text-element-600 dark:s-text-element-600-dark"
            : "",
          "s-overflow-hidden"
        )}
      >
        {label}
      </div>
    </div>
  );
};

interface PriceTableActionContainerProps {
  children: ReactNode;
  size?: "xs" | "sm";
  position?: "top" | "bottom";
}

PriceTable.ActionContainer = function ({
  children,
  size = "xs",
  position = "bottom",
}: PriceTableActionContainerProps) {
  return (
    <>
      {position === "bottom" ? <div className="s-h-full s-w-full" /> : null}
      <div
        className={classNames(
          "s-flex s-w-full s-justify-center s-px-2",
          size === "xs" ? "s-py-2" : "s-py-4",
          position === "top"
            ? "s-border-b s-border-structure-100 dark:s-border-structure-200-dark/50"
            : ""
        )}
      >
        <div className="s-flex s-h-full s-flex-col s-justify-end">
          {children}
        </div>
      </div>
    </>
  );
};

interface PriceTableContainerProps {
  children: ReactNode;
}

PriceTable.Container = function ({ children }: PriceTableContainerProps) {
  return (
    <div className="s-flex s-w-full s-items-stretch s-gap-3">{children}</div>
  );
};
