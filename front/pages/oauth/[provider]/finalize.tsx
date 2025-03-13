import { isOAuthProvider } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI.
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "user",
})<{
  code: string;
  state: string;
  provider: string;
}>(async (context) => {
  const { provider, code, state } = context.query;
  if (!isOAuthProvider(provider)) {
    return {
      notFound: true,
    };
  }
  return {
    props: {
      code: code as string,
      state: state as string,
      provider: provider as string,
    },
  };
});

export default function Finalize({
  code,
  state,
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
        try {
          const res = await fetch(
            `/api/oauth/${provider}/finalize?code=${code}&state=${state}`
          );
          if (!res.ok) {
            throw new Error("Failed to finalize connection");
          }
          const data = await res.json();

          window.opener.postMessage(
            {
              type: "connection_finalized",
              connection: data.connection,
            },
            window.location.origin
          );
        } catch (err) {
          setError("Failed to finalize connection. Please try again.");
        }
      }
    }
    void finalizeOAuth();
  }, [code, state, provider]);

  return error ? <p>{error}</p> : null; // Render nothing.
}
