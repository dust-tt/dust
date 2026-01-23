import type { InferGetServerSidePropsType } from "next";
import { useEffect } from "react";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { useFinalize } from "@app/lib/swr/oauth";
import logger from "@app/logger/logger";
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

      // Prepare message data
      const messageData = res.isErr()
        ? {
            type: "connection_finalized",
            error: res.error.message || "Failed to finalize connection",
            provider,
          }
        : {
            type: "connection_finalized",
            connection: res.value,
            provider,
          };

      // Method 1: window.opener (preferred, direct communication)
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(messageData, window.location.origin);
        } catch (e) {
          logger.error(
            { err: e },
            "[OAuth Finalize] window.opener.postMessage failed",
            e
          );
        }
      } else {
        // Method 2: BroadcastChannel (fallback for modern browsers)
        try {
          const channel = new BroadcastChannel("oauth_finalize");
          channel.postMessage(messageData);
          setTimeout(() => channel.close(), 100);
        } catch (e) {
          logger.error(
            { err: e },
            "[OAuth Finalize] BroadcastChannel failed",
            e
          );
        }
      }

      // Close window after a short delay to ensure message delivery
      setTimeout(() => {
        window.close();
        // If window.close() fails, redirect to home
        setTimeout(() => {
          window.location.href = window.location.origin;
        }, 100);
      }, 1000);
    }
    void finalizeOAuth();
  }, [queryParams, provider, doFinalize]);

  return null; // Render nothing.
}
