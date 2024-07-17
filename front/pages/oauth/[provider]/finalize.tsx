import type { OAuthConnectionType } from "@dust-tt/types";
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
  connection: OAuthConnectionType;
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
      connection: cRes.value,
    },
  };
});

export default function Finalize({
  connection,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // When the component mounts, send a message `connection_finalized` to the window that opened
    // this one.
    if (!window.opener) {
      setError(
        "This URL was unexpectedly visited outside of the Dust Connections setup flow. " +
          "Please close this window and try again from Dust."
      );
    } else {
      window.opener.postMessage(
        {
          type: "connection_finalized",
          connection,
        },
        window.location.origin
      );
    }
  }, [connection]);

  return error ? <p>{error}</p> : null; // Render nothing.
}
