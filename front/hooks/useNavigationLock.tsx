import { useRouter } from "next/router";
import { useContext, useEffect } from "react";
import React from "react";

import { ConfirmContext } from "@app/components/Confirm";

export function useNavigationLock(
  isEnabled = true,
  warningData = {
    title: "Double checking",
    message:
      "You have unsaved changes - are you sure you wish to leave this page?",
    validation: "primaryWarning",
  }
) {
  const router = useRouter();
  const confirm = useContext(ConfirmContext);
  const isNavigatingAway = React.useRef<boolean>(false);

  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!isEnabled) {
        return;
      }
      e.preventDefault();
      return (e.returnValue = warningData);
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

      void confirm(warningData).then((result) => {
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
  }, [isEnabled, warningData, confirm, router]);
}
