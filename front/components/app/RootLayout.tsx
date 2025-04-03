import { UserProvider } from "@auth0/nextjs-auth0/client";
import { SparkleContext } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { MouseEvent } from "react";
import { SWRConfig } from "swr";
import type { UrlObject } from "url";

import { ConfirmPopupArea } from "@app/components/Confirm";
import { SidebarProvider } from "@app/components/sparkle/SidebarContext";
import { isAPIErrorResponse } from "@app/types";
import localFont from "next/font/local";

export const geist = localFont({
  src: [
    {
      path: "../../public/static/fonts/Geist-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-ExtraLight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/Geist-Thin.woff2",
      weight: "100",
      style: "normal",
    },
  ],
  variable: "--font-geist",
  display: "swap",
  preload: true,
});

export const geistMono = localFont({
  src: [
    {
      path: "../../public/static/fonts/GeistMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-UltraLight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../public/static/fonts/GeistMono-Thin.woff2",
      weight: "100",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  preload: true,
});

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

  return (
    <div className={`${geist.variable} ${geistMono.variable} h-full font-sans`}>
      <SparkleContext.Provider
        value={{ components: { link: NextLinkWrapper } }}
      >
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
    </div>
  );
}
