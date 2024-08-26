import { ChevronRightIcon, Icon } from "@dust-tt/sparkle";
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

export const BreadCrumb = ({ items }: BreadcrumbProps) => {
  return (
    <span className="inline-flex items-center gap-2">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <Icon visual={item.icon} className="text-brand" />
          <span className="inline-flex">
            {item.href ? (
              <Link
                href={item.href}
                className={
                  index === items.length - 1
                    ? "text-element-900"
                    : "text-element-700"
                }
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  index === items.length - 1
                    ? "text-element-900"
                    : "text-element-700"
                }
              >
                {item.label}
              </span>
            )}
          </span>
          {index === items.length - 1 ? null : (
            <ChevronRightIcon className="text-element-500" />
          )}
        </React.Fragment>
      ))}
    </span>
  );
};
