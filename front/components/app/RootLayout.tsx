import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext } from "@dust-tt/sparkle";
import Link from "next/link";
import type { MouseEvent } from "react";
import type { UrlObject } from "url";

import { ConfirmPopupArea } from "@app/components/Confirm";
import { NotificationArea } from "@app/components/sparkle/Notification";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";

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
  href: string | UrlObject;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaCurrent?:
    | boolean
    | "time"
    | "false"
    | "true"
    | "page"
    | "step"
    | "location"
    | "date";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  replace?: boolean;
  shallow?: boolean;
  target?: string;
  rel?: string;
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SparkleContext.Provider value={{ components: { link: NextLinkWrapper } }}>
      <UserProvider>
        <SidebarProvider>
          <ConfirmPopupArea>
            <NotificationArea>{children}</NotificationArea>
          </ConfirmPopupArea>
        </SidebarProvider>
      </UserProvider>
    </SparkleContext.Provider>
  );
}
