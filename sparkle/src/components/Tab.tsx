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
    label?: string;
    hideLabel?: boolean;
    current?: boolean;
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
    base: "s-text-element-800 s-border-transparent s-cursor-pointer",
    hover: "hover:s-text-action-500 hover:s-border-action-300",
    dark: {
      base: "dark:s-text-element-700-dark",
      hover: "dark:hover:s-text-action-600-dark",
    },
  },
  selected: {
    base: "s-border-action-500 s-text-action-500 s-cursor-default",
    hover: "",
    dark: {
      base: "dark:s-border-action-500-dark dark:s-text-action-500-dark",
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

  const renderTabs = () =>
    tabs.map((tab) => {
      const tabStateClasses = tab.current
        ? tabClasses.selected
        : tabClasses.default;
      const iconStateClasses = tab.current
        ? iconClasses.selected
        : iconClasses.default;

      const finalTabClasses = classNames(
        "s-group s-justify-center s-flex s-text-sm s-font-semibold s-py-3 s-transition-all ease-out s-duration-400 s-whitespace-nowrap s-select-none s-border-b-2",
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
          <>
            <Tooltip label={tab.label}>{content}</Tooltip>
            {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
          </>
        ) : (
          <>
            {content}
            {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
          </>
        )
      ) : (
        <>
          {content}
          {tab.hasSeparator && <div className="s-flex s-h-full s-grow" />}
        </>
      );
    });

  return (
    <div className="s-border-b s-border-structure-200 dark:s-border-structure-200-dark">
      <nav className="-s-mb-px s-flex s-space-x-0" aria-label="Tabs">
        {renderTabs()}
      </nav>
    </div>
  );
}
