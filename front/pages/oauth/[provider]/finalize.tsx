import type { InferGetServerSidePropsType } from "next";
import { useEffect } from "react";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { postOAuthMessageAndClose } from "@app/lib/oauth/postOAuthMessageAndClose";
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
  const doFinalize = useFinalize();
  // Finalize the connection on component mount.
  useEffect(() => {
    async function finalizeOAuth() {
      // You can end up here when you directly edit the configuration
      // (e.g. go to GitHub and configure repositories from Dust App in Settings, hence no opener).
      const res = await doFinalize(provider, queryParams);

      postOAuthMessageAndClose(
        res.isErr()
          ? {
              type: "connection_finalized",
              error: res.error.message || "Failed to finalize connection",
              provider,
            }
          : {
              type: "connection_finalized",
              connection: res.value,
              provider,
            }
      );
    }
    void finalizeOAuth();
  }, [queryParams, provider, doFinalize]);

  return null; // Render nothing.
}
