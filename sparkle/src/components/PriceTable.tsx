import { Check, Minus, XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";
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
  pink: "bg-brand-pink-rose",
  amber: "bg-brand-sunshine-golden ",
  sky: "bg-brand-sky-blue",
  blue: "bg-brand-electric-blue",
  emerald: "bg-brand-tea-green",
};

const textColorTable = {
  pink: " text-brand-red-rose",
  amber: "text-brand-orange-golden",
  sky: "text-brand-electric-blue",
  blue: "text-brand-sky-blue",
  emerald: "text-brand-hunter-green",
};

const sizeTable = {
  sm: "rounded-2xl p-px shadow-2xl",
  xs: "rounded-2xl p-px shadow-xl",
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
      className={cn(
        "w-full",
        "flex cursor-default flex-col border border-white/30",
        sizeTable[size],
        magnified
          ? "duration-400 scale-95 transition-all ease-out hover:scale-100"
          : "",
        colorTable[color],
        className
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          size === "xs" ? "px-4 py-3" : "px-5 py-4"
        )}
      >
        <div
          className={cn(
            size === "xs" ? "heading-2xl" : "heading-3xl",
            "w-full text-right",
            "text-foreground"
          )}
        >
          {title}
        </div>
        <div className="-mt-2 flex flex-row items-baseline gap-2">
          <span
            className={cn(
              size === "xs" ? "heading-3xl" : "heading-4xl",
              textColorTable[color]
            )}
          >
            {price}
          </span>
          <span
            className={cn(
              "text-foreground",
              size === "xs" ? "heading-base" : "heading-lg"
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
        className={cn(
          "flex h-full flex-col overflow-hidden shadow-md",
          "bg-background"
        )}
      >
        {childrenWithProps}
      </div>
    </div>
  );
}

const iconTable = {
  check: Check,
  dash: Minus,
  xmark: XClose,
};

const iconColorTable = {
  check: "text-green-500",
  dash: "text-golden-500",
  xmark: "text-rose-500",
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
      className={cn(
        size === "xs" ? "gap-2 p-2.5 text-sm" : "gap-3 p-4 text-base",
        "flex items-start border-b",
        "border-border text-muted-foreground",
        className
      )}
    >
      <div className="pt-0.5">
        <Icon
          size={size}
          visual={iconTable[variant]}
          className={iconColorTable[variant]}
        />
      </div>
      <div
        className={cn(
          variant === "xmark" ? "text-primery-600" : "",
          "overflow-hidden"
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
      {position === "bottom" ? <div className="h-full w-full" /> : null}
      <div
        className={cn(
          "flex w-full justify-center px-2",
          size === "xs" ? "py-2" : "py-4",
          position === "top" ? "border-b border-border" : ""
        )}
      >
        <div className="flex h-full flex-col justify-end">{children}</div>
      </div>
    </>
  );
};

interface PriceTableContainerProps {
  children: ReactNode;
}

PriceTable.Container = function ({ children }: PriceTableContainerProps) {
  return <div className="flex w-full items-stretch gap-3">{children}</div>;
};
