import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import { isAPIErrorResponse } from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import type { MouseEvent } from "react";
import { SWRConfig } from "swr";
import type { UrlObject } from "url";

import { ConfirmPopupArea } from "@app/components/Confirm";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <SparkleContext.Provider value={{ components: { link: NextLinkWrapper } }}>
      <SWRConfig
        value={{
          onError: async (error) => {
            if (
              isAPIErrorResponse(error) &&
              error.error.type === "not_authenticated"
            ) {
              // Redirect to login page.
              await router.push("/api/auth/login");
            }
          },
        }}
      >
        <UserProvider>
          <SidebarProvider>
            <ConfirmPopupArea>
              <Notification.Area>{children}</Notification.Area>
            </ConfirmPopupArea>
          </SidebarProvider>
        </UserProvider>
      </SWRConfig>
    </SparkleContext.Provider>
  );
}
