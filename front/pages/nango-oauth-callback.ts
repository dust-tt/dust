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

export default function NangoRedirect() {
  useEffect(() => {
    const nangoURL = `https://api.nango.dev/oauth/callback${window.location.search}`;
    window.location.replace(nangoURL);
  }, []);

  return null; // Render nothing.
}
