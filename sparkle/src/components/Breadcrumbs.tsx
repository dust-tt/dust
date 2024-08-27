import { ChevronRightIcon, Icon } from "@sparkle/index";
import Link from "next/link";
import type { ComponentType } from "react";
import React from "react";

type BreadcrumbProps = {
  items: {
    label: string;
    icon?: ComponentType<{ className?: string }>;
    href?: string;
  }[];
};

export function Breadcrumbs({ items }: BreadcrumbProps) {
  return (
    <div className="gap-2 s-flex s-flex-row s-items-center">
      {items.map((item, index) => (
        <div key={index} className="s-flex s-flex-row s-items-center s-gap-1">
          <Icon visual={item.icon} className="s-text-brand" />
          <div>
            {item.href ? (
              <Link
                href={item.href}
                className={
                  index === items.length - 1
                    ? "s-text-element-900"
                    : "s-text-element-700"
                }
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  index === items.length - 1
                    ? "s-text-element-900"
                    : "s-text-element-700"
                }
              >
                {item.label}
              </span>
            )}
          </div>
          {index === items.length - 1 ? null : (
            <ChevronRightIcon className="s-text-element-500" />
          )}
        </div>
      ))}
    </div>
  );
}
