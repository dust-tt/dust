import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext } from "@dust-tt/sparkle";
import Link from "next/link";
import type { MouseEvent } from "react";

import { SidebarProvider } from "@app/components/sparkle/AppLayout";
import { NotificationArea } from "@app/components/sparkle/Notification";

function NextLinkWrapper({
  href,
  className,
  children,
  ariaCurrent,
  ariaLabel,
  onClick,
}: {
  href: string;
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
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
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
          <NotificationArea>{children}</NotificationArea>
        </SidebarProvider>
      </UserProvider>
    </SparkleContext.Provider>
  );
}
