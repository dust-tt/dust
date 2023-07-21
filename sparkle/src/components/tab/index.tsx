import React, { MouseEvent } from "react";
import { classNames } from "@sparkle/lib/utils";

type TabProps = {
  tabs: Array<{ name: string, href: string, current: boolean }>;
  onTabClick?: (tabName: string, event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
};

const tabClasses = {
  default: {
    base: "text-element-800 border-transparent font-medium",
    hover: "hover:text-action-500",
    dark: {
      base: "dark:text-element-800-dark",
      hover: "dark:hover:text-action-500-dark",
    }
  },
  selected: {
    base: "border-action-500 text-action-500 font-bold",
    hover: "",
    dark: {
      base: "dark:border-action-500-dark dark:text-action-500-dark",
      hover: "",
    }
  }
};
const iconClasses = {
  default: {
    base: "fill-element-600",
    hover: "group-hover:fill-action-400 group-hover:text-action-400",
    dark: {
      base: "dark:fill-element-600-dark",
      hover: "dark:group-hover:fill-action-400-dark",
    }
  },
  selected: {
    base: "fill-action-400",
    hover: "",
    dark: {
      base: "dark:fill-action-400-dark",
      hover: "",
    }
  }
};

export function Tab({ tabs, onTabClick, className = "" }: TabProps) {
  const renderTabs = () => tabs.map((tab) => {
    const tabStateClasses = tab.current ? tabClasses.selected : tabClasses.default;
    const iconStateClasses = tab.current ? iconClasses.selected : iconClasses.default;
    
    const finalTabClasses = classNames(
      "flex gap-x-2 text-sm px-4 py-3 border-b-2 transition-colors duration-200 whitespace-nowrap",
      tabStateClasses.base,
      tabStateClasses.hover,
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
        key={tab.name}
        href={tab.href}
        className={finalTabClasses}
        aria-current={tab.current ? 'page' : undefined}
        onClick={(event) => onTabClick?.(tab.name, event)}
      >
        {tab.name}
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