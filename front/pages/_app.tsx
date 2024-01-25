import "@app/styles/global.css";

import { SparkleContext } from "@dust-tt/sparkle";
import type { AppProps } from "next/app";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import type { MouseEvent, ReactNode } from "react";

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
  children: ReactNode;
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

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <SparkleContext.Provider value={{ components: { link: NextLinkWrapper } }}>
      <SessionProvider session={session}>
        <SidebarProvider>
          <NotificationArea>
            <Component {...pageProps} />
          </NotificationArea>
        </SidebarProvider>
      </SessionProvider>
    </SparkleContext.Provider>
  );
}
