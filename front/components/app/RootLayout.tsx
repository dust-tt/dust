import { SparkleContext } from "@dust-tt/sparkle";
import { Notification } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { MouseEvent } from "react";
import { SWRConfig } from "swr";
import type { UrlObject } from "url";

import { CommandPaletteArea } from "@app/components/command_palette/CommandPalette";
import { ConfirmPopupArea } from "@app/components/Confirm";
import { NavigationLoadingProvider } from "@app/components/sparkle/NavigationLoadingContext";
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
              await router.push("/api/workos/login");
            }
          },
        }}
      >
        <SidebarProvider>
          <NavigationLoadingProvider>
            <CommandPaletteArea>
              <ConfirmPopupArea>
                <Notification.Area>{children}</Notification.Area>
              </ConfirmPopupArea>
            </CommandPaletteArea>
          </NavigationLoadingProvider>
        </SidebarProvider>
      </SWRConfig>
    </SparkleContext.Provider>
  );
}
