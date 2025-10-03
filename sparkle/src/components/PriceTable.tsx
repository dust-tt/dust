import React, { ReactNode } from "react";

import { CheckIcon, DashIcon, XMarkIcon } from "@sparkle/icons/app";
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
  dataAnalytics?: string;
}

const colorTable = {
  pink: "s-bg-brand-pink-rose",
  amber: "s-bg-brand-sunshine-golden ",
  sky: "s-bg-brand-sky-blue",
  blue: "s-bg-brand-electric-blue",
  emerald: "s-bg-brand-tea-green",
};

const textColorTable = {
  pink: " s-text-brand-red-rose",
  amber: "s-text-brand-orange-golden",
  sky: "s-text-brand-electric-blue",
  blue: "s-text-brand-sky-blue",
  emerald: "s-text-brand-hunter-green",
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
  dataAnalytics,
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
      data-analytics={dataAnalytics}
    >
      <div
        className={classNames(
          "s-flex s-flex-col",
          size === "xs" ? "s-px-4 s-py-3" : "s-px-5 s-py-4"
        )}
      >
        <div
          className={classNames(
            size === "xs" ? "s-heading-2xl" : "s-heading-3xl",
            "s-w-full s-text-right",
            "s-text-foreground"
          )}
        >
          {title}
        </div>
        <div className="-s-mt-2 s-flex s-flex-row s-items-baseline s-gap-2">
          <span
            className={classNames(
              size === "xs" ? "s-heading-3xl" : "s-heading-4xl",
              textColorTable[color]
            )}
          >
            {price}
          </span>
          <span
            className={classNames(
              "s-text-foreground",
              size === "xs" ? "s-heading-base" : "s-heading-lg"
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
          "s-bg-background dark:s-bg-muted-background-night"
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
  check: "s-text-green-500",
  dash: "s-text-golden-500",
  xmark: "s-text-rose-500",
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
        "s-border-border s-text-muted-foreground",
        "dark:s-border-border-dark-night dark:s-text-muted-foreground-night",
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
            ? "s-text-primery-600 dark:s-text-primery-600-night"
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
            ? "s-border-b s-border-border dark:s-border-border-dark-night"
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
