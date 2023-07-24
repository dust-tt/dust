import { ReactComponentLike } from "prop-types";
import React, { MouseEvent } from "react";

import { classNames } from "@sparkle/lib/utils";

type TabProps = {
  tabs: Array<{
    label: string;
    hideLabel?: boolean;
    href: string;
    current: boolean;
    sizing?: "hug" | "expand";
    icon?: ReactComponentLike;
  }>;
  onTabClick?: (tabName: string, event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
};

const tabClasses = {
  default: {
    base: "text-element-800 border-transparent",
    hover: "hover:text-action-600",
    dark: {
      base: "dark:text-element-800-dark",
      hover: "dark:hover:text-action-600-dark",
    },
  },
  selected: {
    base: "border-action-500 text-action-600 cursor-default",
    hover: "",
    dark: {
      base: "dark:border-action-500-dark dark:text-action-500-dark",
      hover: "",
    },
  },
};

const iconClasses = {
  default: {
    base: "text-element-600",
    hover: "group-hover:text-action-400 group-hover:text-action-400",
    dark: {
      base: "dark:text-element-600-dark",
      hover: "dark:group-hover:text-action-400-dark",
    },
  },
  selected: {
    base: "text-action-400",
    hover: "",
    dark: {
      base: "dark:text-action-400-dark",
      hover: "",
    },
  },
};

const tabSizingClasses = {
  hug: "",
  expand: "flex-1",
};
        
export function Tab({ tabs, onTabClick, className = "" }: TabProps) {
  const renderTabs = () =>
    tabs.map((tab) => {
      const tabStateClasses = tab.current
        ? tabClasses.selected
        : tabClasses.default;
      const iconStateClasses = tab.current
        ? iconClasses.selected
        : iconClasses.default;

      const finalTabClasses = classNames(
        "group justify-center flex gap-x-2 text-sm font-medium px-4 py-3 border-b-2 transition-colors duration-200 whitespace-nowrap",
        tabStateClasses.base,
        tabStateClasses.hover,
        tabSizingClasses[tab.sizing ?? "hug"],
        className
      );
      
      const finalIconClasses = classNames(
        "h-5 w-5",
        iconStateClasses.base,
        iconStateClasses.hover,
        className
      );

      return (
        <a
          key={tab.label}
          href={tab.href}
          className={finalTabClasses}
          aria-current={tab.current ? "page" : undefined}
          onClick={(event) => onTabClick?.(tab.label, event)}
        >
          {tab.icon && <tab.icon className={finalIconClasses} />}
          {tab.hideLabel ?? tab.label}
        </a>
      );
    });

  return (
    <div className="border-b border-structure-200 dark:border-structure-200-dark">
      <nav className="-mb-px flex space-x-0" aria-label="Tabs">
        {renderTabs()}
      </nav>
    </div>
  );
}
