import { SparkleContext } from "@dust-tt/sparkle";
import type { UrlObject } from "url";
import Link from "next/link";
import React, { useMemo } from "react";

function NextLinkWrapper({
  href,
  className,
  children,
  ariaCurrent,
  ariaLabel,
  onClick,
  replace = false,
  shallow = false,
  target = "_self",
  rel,
}: {
  ariaCurrent?:
    | boolean
    | "time"
    | "false"
    | "true"
    | "page"
    | "step"
    | "location"
    | "date";
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
  href: string | UrlObject;
  // @ts-ignore
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      target={target}
      rel={rel}
      shallow={shallow}
      replace={replace}
    >
      {children}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const contextValue = useMemo(
    () => ({
      components: { link: NextLinkWrapper },
    }),
    [],
  );

  return (
    <SparkleContext.Provider value={contextValue}>
      {children}
    </SparkleContext.Provider>
  );
}
