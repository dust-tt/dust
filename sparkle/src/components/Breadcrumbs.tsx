import type { ComponentType } from "react";
import React from "react";

import { DropdownMenu } from "@sparkle/components/DropdownMenu";
import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { SparkleContext, SparkleContextLinkType } from "@sparkle/context";
import { ChevronRightIcon } from "@sparkle/icons";

const LABEL_TRUNCATE_LENGTH_MIDDLE = 15;
const LABEL_TRUNCATE_LENGTH_END = 30;
const ELLIPSIS_STRING = "...";

interface BreadcrumbItem {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

interface BreadcrumbsAccumulator {
  itemsShown: BreadcrumbItem[];
  itemsHidden: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbProps) {
  const { components } = React.useContext(SparkleContext);

  const Link: SparkleContextLinkType = components.link;

  const { itemsShown, itemsHidden } = items.reduce(
    (acc: BreadcrumbsAccumulator, item, index) => {
      if (items.length <= 5 || index < 2 || index >= items.length - 2) {
        acc.itemsShown.push(item);
      } else if (index === 2) {
        acc.itemsShown.push({ label: ELLIPSIS_STRING });
        acc.itemsHidden.push(item);
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
                <DropdownMenu.Button>{ELLIPSIS_STRING}</DropdownMenu.Button>
                <DropdownMenu.Items origin="topLeft">
                  {itemsHidden.map((item, index) => (
                    <DropdownMenu.Item
                      icon={item.icon}
                      label={item.label}
                      link={item.href ? { href: item.href } : undefined}
                      key={`breadcrumbs-hidden-${index}`}
                    >
                      {truncateWithTooltip(
                        item.label,
                        LABEL_TRUNCATE_LENGTH_MIDDLE
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Items>
              </DropdownMenu>
            ) : (
              <div>
                <Link
                  href={item.href || "#"}
                  className={
                    index === items.length - 1
                      ? "s-text-element-900"
                      : "s-text-element-700"
                  }
                >
                  {index === items.length - 1
                    ? truncateWithTooltip(item.label, LABEL_TRUNCATE_LENGTH_END)
                    : truncateWithTooltip(
                        item.label,
                        LABEL_TRUNCATE_LENGTH_MIDDLE
                      )}
                </Link>
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

function truncateWithTooltip(text: string, length: number) {
  return text.length > length ? (
    <Tooltip
      trigger={`${text.substring(0, length - 1)}${ELLIPSIS_STRING}`}
      label={text}
    />
  ) : (
    text
  );
}
