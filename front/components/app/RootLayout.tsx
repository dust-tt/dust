import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext, Spinner } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { MouseEvent } from "react";
import type { UrlObject } from "url";

import { ConfirmPopupArea } from "@app/components/Confirm";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";

const RootSWRConfig = dynamic(
  () => import("./RootSWRConfig").then((mod) => mod.RootSWRConfig),
  { ssr: false, loading: () => <Spinner /> }
);

function NextLinkWrapper({
  href,
  className,
  children,
  ariaCurrent,
  ariaLabel,
  onClick,
  replace = false,
  shallow = false,
  prefetch,
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
  prefetch?: boolean;
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
      prefetch={prefetch}
    >
      {children}
    </Link>
  );
}

/**
 * This layout is used in _app only
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SparkleContext.Provider value={{ components: { link: NextLinkWrapper } }}>
      <RootSWRConfig>
        <UserProvider>
          <SidebarProvider>
            <ConfirmPopupArea>
              <Notification.Area>{children}</Notification.Area>
            </ConfirmPopupArea>
          </SidebarProvider>
        </UserProvider>
      </RootSWRConfig>
    </SparkleContext.Provider>
  );
}
