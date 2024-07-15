import { isOAuthProvider } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { finalizeConnection } from "@app/lib/api/oauth";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI.
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "user",
})<{
  connectionId: string;
}>(async (context) => {
  const provider = context.query.provider as string;
  if (!isOAuthProvider(provider)) {
    return {
      notFound: true,
    };
  }

  const cRes = await finalizeConnection(provider, context.query);
  if (!cRes.isOk()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      connectionId: cRes.value.connection_id,
    },
  };
});

export default function Finalize({
  connectionId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // When the component mounts and connectionId is available, send a message `connection_finalized
    // `to the window that opened this one.
    if (connectionId) {
      if (!window.opener) {
        setError(
          "This URL was unexpectedly visited outside of the Dust Connections setup flow. " +
            "Please close this window and try again from Dust."
        );
      } else {
        window.opener.postMessage(
          {
            type: "connection_finalized",
            connectionId: connectionId,
          },
          window.location.origin
        );
      }
    }
  }, [connectionId]);

  return error ? <p>{error}</p> : null; // Render nothing.
}
