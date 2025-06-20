import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { MouseEvent } from "react";
import { useEffect } from "react";
import { SWRConfig } from "swr";
import type { UrlObject } from "url";

import { ConfirmPopupArea } from "@app/components/Confirm";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { isAPIErrorResponse } from "@app/types";

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
  const router = useRouter();

  useEffect(() => {
    const handleRouteChangeStart = (url: string) => {
      console.log("🚀 Router: Navigation started", {
        from: router.asPath,
        to: url,
        timestamp: new Date().toISOString()
      });
    };

    const handleRouteChangeComplete = (url: string) => {
      console.log("✅ Router: Navigation completed", {
        url,
        timestamp: new Date().toISOString()
      });
    };

    const handleRouteChangeError = (err: any, url: string) => {
      console.log("❌ Router: Navigation error", {
        error: err,
        url,
        timestamp: new Date().toISOString()
      });
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeError);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeError);
    };
  }, [router]);

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
