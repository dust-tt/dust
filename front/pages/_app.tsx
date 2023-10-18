import "@app/styles/global.css";

import { SparkleContext } from "@dust-tt/sparkle";
import { AppProps } from "next/app";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { MouseEvent, ReactNode } from "react";

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
        <NotificationArea>
          <Component {...pageProps} />
        </NotificationArea>
      </SessionProvider>
    </SparkleContext.Provider>
  );
}
