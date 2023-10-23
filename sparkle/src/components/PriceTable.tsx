import React, { ReactNode } from "react";

import { Check, Dash, XMark } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

interface PriceTableProps {
  title: string;
  price: string;
  priceLabel?: string;
  color?: "pink" | "sky" | "emerald" | "amber" | "blue";
  className?: string;
  children: ReactNode;
}

const colorTable = {
  pink: "s-bg-pink-400 dark:s-bg-pink-500",
  amber: "s-bg-amber-400 dark:s-bg-amber-500",
  sky: "s-bg-sky-400 dark:s-bg-sky-500",
  blue: "s-bg-blue-400 dark:s-bg-blue-500",
  emerald: "s-bg-emerald-400 dark:s-bg-emerald-500",
};

const textColorTable = {
  pink: "s-text-pink-900 dark:s-text-pink-950",
  amber: "s-text-amber-900 dark:s-text-amber-950",
  sky: "s-text-sky-900 dark:s-text-sky-950",
  blue: "s-text-blue-900 dark:s-text-blue-950",
  emerald: "s-text-emerald-900 dark:s-text-emerald-950",
};

export function PriceTable({
  title,
  price,
  color = "pink",
  priceLabel = "",
  className = "",
  children, // Use children instead of tableItems
}: PriceTableProps) {
  return (
    <div
      className={classNames(
        "s-w-72",
        "s-flex s-cursor-default s-flex-col s-rounded-xl s-p-1 s-shadow-xl",
        "s-duration-400 s-scale-95 s-transition-all s-ease-out hover:s-scale-100",
        colorTable[color],
        className
      )}
    >
      <div className="s-flex s-flex-col s-px-3 s-py-2">
        <div
          className={classNames(
            "s-w-full s-text-right s-text-2xl s-font-semibold",
            "s-text-structure-0"
          )}
        >
          {title}
        </div>
        <div className="-s-mt-2 s-flex s-flex-row s-items-baseline s-gap-2">
          <span
            className={classNames(
              textColorTable[color],
              "s-text-3xl s-font-bold"
            )}
          >
            {price}
          </span>
          <span className="s-text-base s-font-bold s-text-white/70">
            {priceLabel}
          </span>
        </div>
      </div>
      <div
        className={classNames(
          "s-flex s-h-full s-flex-col s-overflow-hidden s-rounded-lg s-shadow-md",
          "s-bg-white dark:s-bg-structure-100-dark"
        )}
      >
        {children}
      </div>
    </div>
  );
}

const iconTable = {
  check: Check,
  dash: Dash,
  xmark: XMark,
};

const iconColorTable = {
  check: "s-text-emerald-500",
  dash: "s-text-amber-500",
  xmark: "s-text-red-500",
};

interface PriceTableItemProps {
  label: string;
  variant?: "check" | "dash" | "xmark";
  className?: string;
}

PriceTable.Item = function ({
  label,
  variant = "check",
  className = "",
}: PriceTableItemProps) {
  return (
    <div
      className={classNames(
        "s-flex s-items-center s-gap-1.5 s-border-b s-px-2 s-py-2.5 s-text-sm",
        "s-border-structure-100 s-text-element-800",
        "dark:s-border-structure-200-dark/50 dark:s-text-element-800-dark",
        className
      )}
    >
      <div>
        <Icon
          size="xs"
          visual={iconTable[variant]}
          className={iconColorTable[variant]}
        />
      </div>
      <div
        className={classNames(
          variant === "xmark"
            ? "s-text-element-600 dark:s-text-element-600-dark"
            : "",
          "s-overflow-hidden s-overflow-ellipsis s-whitespace-nowrap"
        )}
      >
        {label}
      </div>
    </div>
  );
};

interface PriceTableActionContainerProps {
  children: ReactNode;
}

PriceTable.ActionContainer = function ({
  children,
}: PriceTableActionContainerProps) {
  return (
    <div className="s-flex s-w-full s-flex-grow s-justify-center s-p-2">
      <div className="s-flex s-h-full s-flex-col s-justify-end">{children}</div>
    </div>
  );
};

interface PriceTableContainerProps {
  children: ReactNode;
}

PriceTable.Container = function ({ children }: PriceTableContainerProps) {
  return <div className="s-flex s-w-full s-gap-3">{children}</div>;
};
