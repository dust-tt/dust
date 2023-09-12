import React, { ComponentType, MouseEvent, ReactNode } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

type TabProps = {
  tabs: Array<{
    label: string;
    hideLabel?: boolean;
    current: boolean;
    sizing?: "hug" | "expand";
    icon?: ComponentType<{ className?: string }>;
    href?: string;
    hasSeparator?: boolean;
  }>;
  onTabClick?: (tabName: string, event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
};

const tabClasses = {
  default: {
    base: "s-text-element-800 s-cursor-pointer",
    hover: "hover:s-text-action-500",
    dark: {
      base: "dark:s-text-element-700-dark",
      hover: "dark:hover:s-text-action-600-dark",
    },
  },
  selected: {
    base: "s-text-action-500 s-cursor-default",
    hover: "",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "",
    },
  },
};

const iconClasses = {
  default: {
    base: "s-text-element-600",
    hover: "group-hover:s-text-action-400",
    dark: {
      base: "dark:s-text-element-600-dark",
      hover: "dark:group-hover:s-text-action-500-dark",
    },
  },
  selected: {
    base: "s-text-action-400",
    hover: "",
    dark: {
      base: "dark:s-text-action-500-dark",
      hover: "",
    },
  },
};

const tabSizingClasses = {
  hug: "",
  expand: "s-flex-1",
};

export function Tab({ tabs, onTabClick, className = "" }: TabProps) {
  const { components } = React.useContext(SparkleContext);

  const rectangleRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = tabs.map(() => React.useRef<HTMLElement | null>(null));

  React.useEffect(() => {
    const selectedTabIndex = tabs.findIndex((tab) => tab.current);
    if (selectedTabIndex !== -1) {
      const selectedTabRef = tabRefs[selectedTabIndex].current;
      if (selectedTabRef) {
        const rect = selectedTabRef.getBoundingClientRect();
        if (rectangleRef.current) {
          rectangleRef.current.style.left = `${rect.left}px`;
          rectangleRef.current.style.width = `${rect.width}px`;
        }
      }
    }
  }, [tabs]);

  const renderTabs = () =>
    tabs.map((tab, i) => {
      const tabStateClasses = tab.current
        ? tabClasses.selected
        : tabClasses.default;
      const iconStateClasses = tab.current
        ? iconClasses.selected
        : iconClasses.default;

      const finalTabClasses = classNames(
        "s-group s-justify-center s-flex s-text-sm s-font-semibold s-px-4 s-py-3 s-transition-all ease-out s-duration-400 s-whitespace-nowrap s-select-none",
        "s-group s-justify-center s-flex s-text-sm s-font-semibold s-py-3 s-transition-all ease-out s-duration-400 s-whitespace-nowrap s-select-none",
        tab.icon ? " s-pr-5 s-pl-4" : " s-px-5",
        tabStateClasses.base,
        tabStateClasses.hover,
        tabStateClasses.dark.base,
        tabStateClasses.dark.hover,
        tabSizingClasses[tab.sizing ?? "hug"],
        className
      );

      const finalIconClasses = classNames(
        "s-transition-colors s-duration-400",
        iconStateClasses.base,
        iconStateClasses.hover,
        iconStateClasses.dark.base,
        iconStateClasses.dark.hover,
        className
      );

      const Link: SparkleContextLinkType = tab.href
        ? components.link
        : noHrefLink;

      const content: ReactNode = (
        <Link
          key={tab.label}
          className={finalTabClasses}
          aria-current={tab.current ? "page" : undefined}
          onClick={(event) => onTabClick?.(tab.label ? tab.label : "", event)}
          href={tab.href || "#"}
        >
          <div
            className={
              tab.current
                ? "s-flex s-gap-x-2"
                : "s-flex s-gap-x-2 s-transition s-duration-300 s-ease-out"
            }
          >
            {tab.icon && (
              <Icon visual={tab.icon} className={finalIconClasses} size="sm" />
            )}
            {tab.hideLabel ?? tab.label}
          </div>
        </Link>
      );
      return tab.hideLabel ? (
        tab.label ? (
          <div key={`tab-${i}`}>
            <Tooltip label={tab.label}>{content}</Tooltip>
            {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
          </div>
        ) : (
          <div key={`tab-${i}`}>
            {content}
            {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
          </div>
        )
      ) : (
        <div key={`tab-${i}`}>
          {content}
          {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
        </div>
      );
    });

  return (
    <div className="s-border-b s-border-structure-200 dark:s-border-structure-200-dark">
      <nav className="s-relative -s-mb-px s-flex s-space-x-0" aria-label="Tabs">
        <div
          className="ease-out s-duration-400 s-absolute s-bottom-0 s-h-0.5 s-bg-action-500 s-transition-all"
          ref={rectangleRef}
        ></div>
        {renderTabs()}
      </nav>
    </div>
  );
}
