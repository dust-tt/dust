import {
  connectionPayloadForOpener,
  resolveOAuthPostMessageTargetOrigin,
} from "@app/lib/oauth/opener_origin";
import { useAppRouter, usePathParam } from "@app/lib/platform";
import { useFinalize } from "@app/lib/swr/oauth";
import logger from "@app/logger/logger";
import { isOAuthProvider } from "@app/types/oauth/lib";
import { Spinner } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";

export function OAuthFinalizePage() {
  const router = useAppRouter();
  const providerParam = usePathParam("provider");
  const doFinalize = useFinalize();

  // Validate provider (null if router not ready or invalid provider)
  const provider =
    providerParam && isOAuthProvider(providerParam) ? providerParam : null;

  // Extract query params (excluding 'provider' which is a path param)
  // Memoize to avoid re-creating the object on every render
  const queryParams = useMemo(() => {
    const params: Record<string, string | string[] | undefined> = {};
    if (router.isReady) {
      for (const [key, value] of Object.entries(router.query)) {
        if (key !== "provider") {
          params[key] = value;
        }
      }
    }
    return params;
  }, [router.isReady, router.query]);

  useEffect(() => {
    // Wait for router to be ready, auth to be confirmed, and provider to be valid
    if (!router.isReady || !provider) {
      return;
    }

    // Capture provider for closure (TypeScript narrowing)
    const validProvider = provider;

    async function finalizeOAuth() {
      // You can end up here when you directly edit the configuration
      // (e.g. go to GitHub and configure repositories from Dust App in Settings, hence no opener).
      const res = await doFinalize(validProvider, queryParams);

      // Prepare message data. Success payloads omit connection metadata so a
      // compromised trusted origin does not also receive workspace/user ids or
      // opener_origin; connection_id remains (required for legitimate openers).
      const messageData = res.isErr()
        ? {
            type: "connection_finalized",
            error: res.error.message || "Failed to finalize connection",
            provider: validProvider,
          }
        : {
            type: "connection_finalized",
            connection: connectionPayloadForOpener(res.value),
            provider: validProvider,
          };

      // Re-validate opener_origin from connection metadata before postMessage.
      // Attacker-controlled values must never be used as targetOrigin.
      const rawOpenerOrigin = res.isOk()
        ? res.value.metadata.opener_origin
        : undefined;
      const targetOrigin = resolveOAuthPostMessageTargetOrigin(
        rawOpenerOrigin,
        window.location.origin
      );

      // Method 1: window.opener (preferred, direct communication)
      if (window.opener && !window.opener.closed && targetOrigin) {
        try {
          window.opener.postMessage(messageData, targetOrigin);
        } catch (e) {
          logger.error(
            { err: e },
            "[OAuth Finalize] window.opener.postMessage failed",
            e
          );
        }
      } else if (!window.opener || window.opener.closed) {
        // Method 2: BroadcastChannel (fallback for modern browsers; same-origin only)
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
  }, [router.isReady, provider, queryParams, doFinalize]);

  // Show spinner while authenticating or waiting for router
  if (!providerParam) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Router is ready but provider is invalid
  if (!provider) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-element-700">
          <Trans>Invalid OAuth provider.</Trans>
        </p>
      </div>
    );
  }

  return null; // Render nothing while processing
}
