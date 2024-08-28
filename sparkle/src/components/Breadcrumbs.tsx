import type { ComponentType } from "react";
import React from "react";

import { noHrefLink, SparkleContextLinkType } from "@sparkle/context";
import {
  ChevronRightIcon,
  DropdownMenu,
  Icon,
  SparkleContext,
  Tooltip,
} from "@sparkle/index";

const LABEL_TRUNCATE_LENGTH_MIDDLE = 15;
const LABEL_TRUNCATE_LENGTH_END = 30;
const ELLIPSIS_STRING = "...";

type BreadcrumbItem = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

type BreadcrumbsAccumulator = {
  itemsShown: BreadcrumbItem[];
  itemsHidden: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbProps) {
  const { components } = React.useContext(SparkleContext);

  const { itemsShown, itemsHidden } = items.reduce(
    (acc: BreadcrumbsAccumulator, item, index) => {
      if (items.length <= 5 || index < 2 || index >= items.length - 2) {
        acc.itemsShown.push(item);
      } else if (index === 2) {
        acc.itemsShown.push({ label: ELLIPSIS_STRING });
      } else {
        acc.itemsHidden.push(item);
      }
      return acc;
    },
    { itemsShown: [], itemsHidden: [] }
  );

  return (
    <div className="gap-2 s-flex s-flex-row s-items-center">
      {itemsShown.map((item, index) => {
        return (
          <div
            key={`breadcrumbs-${index}`}
            className="s-flex s-flex-row s-items-center s-gap-1"
          >
            <Icon visual={item.icon} className="s-text-brand" />
            {item.label === ELLIPSIS_STRING ? (
              <DropdownMenu>
                <DropdownMenu.Button>${ELLIPSIS_STRING}</DropdownMenu.Button>
                <DropdownMenu.Items origin="topLeft">
                  {itemsHidden.map((item, index) => (
                    <DropdownMenu.Item
                      key={`breadcrumbs-hidden-${index}`}
                      icon={item.icon}
                      label={item.label}
                    >
                      {getLinkForItem(item, false, components.link)}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Items>
              </DropdownMenu>
            ) : (
              <div>
                {getLinkForItem(
                  item,
                  index === itemsShown.length - 1,
                  components.link
                )}
              </div>
            )}
            {index === itemsShown.length - 1 ? null : (
              <ChevronRightIcon className="s-text-element-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function getLinkForItem(
  item: BreadcrumbItem,
  isLast: boolean,
  link: SparkleContextLinkType
) {
  const Link: SparkleContextLinkType = item.href ? link : noHrefLink;

  return (
    <Link
      href={item.href || "#"}
      className={isLast ? "s-text-element-900" : "s-text-element-700"}
    >
      {isLast
        ? truncateWithTooltip(item.label, LABEL_TRUNCATE_LENGTH_END)
        : truncateWithTooltip(item.label, LABEL_TRUNCATE_LENGTH_MIDDLE)}
    </Link>
  );
}

function truncateWithTooltip(text: string, length: number) {
  return text.length > length ? (
    <Tooltip label={text}>{`${text.substring(0, length - 1)}…`}</Tooltip>
  ) : (
    text
  );
}
