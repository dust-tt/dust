import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import {
  decrementNavigationLock,
  incrementNavigationLock,
} from "@app/lib/navigation-lock";
import { useAppRouter, useNavigationBlocker } from "@app/lib/platform";
import { useLingui } from "@lingui/react/macro";
import React, { useCallback, useContext, useEffect, useMemo } from "react";

export function useNavigationLock(
  isEnabled = true,
  warningData?: ConfirmDataType
) {
  const { t } = useLingui();
  const lockWarningData = useMemo(
    () =>
      warningData ?? {
        title: t`Discard your unsaved changes?`,
        message: t`If you leave now, your latest edits won't be kept.`,
        validateLabel: t`Discard`,
        cancelLabel: t`Keep editing`,
      },
    [warningData, t]
  );
  const router = useAppRouter();
  const confirm = useContext(ConfirmContext);
  const isNavigatingAway = React.useRef<boolean>(false);

  // SPA (React Router): use useBlocker to intercept all navigation
  // (browser back/forward, link clicks, programmatic navigate()).
  const onBlock = useCallback(
    () => confirm(lockWarningData),
    [confirm, lockWarningData]
  );

  useNavigationBlocker(isEnabled, onBlock);

  // Prevent programmatic reloads (e.g. from SWR resHandler) while the lock is active.
  useEffect(() => {
    if (isEnabled) {
      incrementNavigationLock();
      return () => decrementNavigationLock();
    }
  }, [isEnabled]);

  // Next.js: use routeChangeStart events to intercept navigation.
  // This is a noop in the SPA since routeChangeStart is not emitted
  // for browser-initiated navigation.
  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!isEnabled) {
        return;
      }
      e.preventDefault();
      return (e.returnValue = lockWarningData);
    };

    const handleBrowseAway = (url: string) => {
      if (!isEnabled) {
        return;
      }
      if (isNavigatingAway.current) {
        return;
      }

      // Changing the query param is not leaving the page
      const currentRoute = router.asPath.split("?")[0];
      const newRoute = url.split("?")[0];
      if (currentRoute === newRoute) {
        return;
      }

      router.events.emit(
        "routeChangeError",
        new Error("Navigation paused to await confirmation by user"),
        url
      );
      // This is required, otherwise the URL will change.
      history.pushState(null, "", document.location.href);

      void confirm(lockWarningData).then((result) => {
        if (result) {
          isNavigatingAway.current = true;
          void router.back();
        }
      });

      // And this is required to actually cancel the navigation.
      throw "Navigation paused to await confirmation by user";
    };

    // We need both for different browsers.
    window.addEventListener("beforeunload", handleWindowClose);
    router.events.on("routeChangeStart", handleBrowseAway);

    return () => {
      window.removeEventListener("beforeunload", handleWindowClose);
      router.events.off("routeChangeStart", handleBrowseAway);
    };
  }, [isEnabled, lockWarningData, confirm, router]);
}
