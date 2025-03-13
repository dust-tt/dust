import { isOAuthProvider } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI.
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "user",
})<{
  queryParams: Record<string, string | string[] | undefined>;
  provider: string;
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
      provider: provider as string,
    },
  };
});

export default function Finalize({
  queryParams,
  provider,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function finalizeOAuth() {
      // When the component mounts, send a message `connection_finalized` to the window that opened
      // this one.
      if (!window.opener) {
        setError(
          "This URL was unexpectedly visited outside of the Dust Connections setup flow. " +
            "Please close this window and try again from Dust."
        );
      } else {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v));
          } else if (value !== undefined) {
            params.append(key, value);
          }
        }

        const res = await fetch(
          `/api/oauth/${provider}/finalize?${params.toString()}`
        );
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
