import { ChevronRightIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

type BreadcrumbProps = {
  items: {
    label: string;
    icon?: ReactElement;
    href?: string;
  }[];
};

export const BreadCrumb = ({ items }: BreadcrumbProps) => {
  return (
    <span className="inline-flex items-center gap-2">
      {items.map((item, index) => (
        <>
          {item.icon}
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
        </>
      ))}
    </span>
  );
};
