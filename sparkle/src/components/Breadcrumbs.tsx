import type { ComponentType } from "react";
import React from "react";

import { Button } from "@sparkle/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { SparkleContext, SparkleContextLinkType } from "@sparkle/context";
import { ChevronRightIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib";

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
  className?: string;
}

interface BreadcrumbsAccumulator {
  itemsShown: BreadcrumbItem[];
  itemsHidden: BreadcrumbItem[];
}

export function Breadcrumbs({ items, className }: BreadcrumbProps) {
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
    <div className={cn("s-flex s-flex-row s-items-center s-gap-1", className)}>
      {itemsShown.map((item, index) => {
        return (
          <div
            key={`breadcrumbs-${index}`}
            className="s-flex s-flex-row s-items-center s-gap-1"
          >
            <Icon
              visual={item.icon}
              className="s-text-muted-foreground dark:s-text-muted-foreground-night"
            />
            {item.label === ELLIPSIS_STRING ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" label={ELLIPSIS_STRING} />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    {itemsHidden.map((item, index) => (
                      <DropdownMenuItem
                        key={`breadcrumbs-hidden-${index}`}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                      />
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : item.href ? (
              <Link
                href={item.href}
                className={
                  index === itemsShown.length - 1
                    ? "s-font-medium s-text-foreground dark:s-text-foreground-night"
                    : "s-text-muted-foreground dark:s-text-muted-foreground-night"
                }
              >
                {index === itemsShown.length - 1
                  ? truncateWithTooltip(item.label, LABEL_TRUNCATE_LENGTH_END)
                  : truncateWithTooltip(
                      item.label,
                      LABEL_TRUNCATE_LENGTH_MIDDLE
                    )}
              </Link>
            ) : (
              <div
                className={
                  index === itemsShown.length - 1
                    ? "s-font-medium s-text-foreground dark:s-text-foreground-night"
                    : "s-text-muted-foreground dark:s-text-muted-foreground-night"
                }
              >
                {index === itemsShown.length - 1
                  ? truncateWithTooltip(item.label, LABEL_TRUNCATE_LENGTH_END)
                  : truncateWithTooltip(
                      item.label,
                      LABEL_TRUNCATE_LENGTH_MIDDLE
                    )}
              </div>
            )}
            {index === itemsShown.length - 1 ? null : (
              <ChevronRightIcon className="s-text-primary-300 dark:s-text-primary-700" />
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
