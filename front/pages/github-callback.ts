import { useEffect } from "react";

import config from "@app/lib/api/config";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{ gaTrackingId: string }>(async () => {
  return {
    props: {
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function Complete() {
  useEffect(() => {
    // When the component mounts, send a message to the window that opened this one.
    const queryString = window.location.search
      .slice(1)
      .split("&")
      .map((p) => p.split("="))
      .reduce(
        (acc, [k, v]) => ({ ...acc, [k]: v }),
        {} as Record<string, string>
      );
    window.opener &&
      window.opener.postMessage(
        {
          type: "installed_or_updated",
          installationId: queryString["installation_id"],
        },
        window.location.origin
      );
  }, []);

  return null; // Render nothing.
}
