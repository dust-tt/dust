import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { useFinalize } from "@app/lib/swr/oauth";
import type { OAuthProvider } from "@app/types";
import { isOAuthProvider } from "@app/types";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI.
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "user",
})<{
  queryParams: Record<string, string | string[] | undefined>;
  provider: OAuthProvider;
}>(async (context) => {
  const { provider, ...queryParams } = context.query;

  if (!isOAuthProvider(provider)) {
    return {
      notFound: true,
    };
  }
  return {
    props: {
      queryParams,
      provider,
    },
  };
});

export default function Finalize({
  queryParams,
  provider,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState<string | null>(null);
  const doFinalize = useFinalize();
  // Finalize the connection on component mount.
  useEffect(() => {
    async function finalizeOAuth() {
      if (!window.opener) {
        setError(
          "This URL was unexpectedly visited outside of the Dust Connections setup flow. " +
            "Please close this window and try again from Dust."
        );
      } else {
        const res = await doFinalize(provider, queryParams);
        // Send a message `connection_finalized` to the window that opened
        // this one, with either an error or the connection data.
        if (!res.ok) {
          window.opener.postMessage(
            {
              type: "connection_finalized",
              error: "Failed to finalize connection",
            },
            window.location.origin
          );
        } else {
          const data = await res.json();

          window.opener.postMessage(
            {
              type: "connection_finalized",
              connection: data.connection,
            },
            window.location.origin
          );
        }
      }
    }
    void finalizeOAuth();
  }, [queryParams, provider]);

  return error ? <p>{error}</p> : null; // Render nothing.
}
