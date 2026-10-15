import { ServerVisualizationWrapperClient } from "@viz/app/content/ServerVisualizationWrapperClient";
import type { VizCatalog } from "@viz/app/lib/i18n/catalogs";
import logger from "@viz/app/lib/logger";

interface ServerSideVisualizationWrapperProps {
  accessToken: string;
  allowedOrigins: string[];
  identifier: string;
  isFullHeight?: boolean;
  isPdfMode?: boolean;
  catalog: VizCatalog;
}

/**
 * Server-side visualization wrapper for JWT-authenticated public frames
 *
 * This component runs on the server and:
 * 1. Pre-fetches visualization code using the JWT access token
 * 2. Passes the pre-fetched code and the access token to the client wrapper, which downloads
 *    referenced files through the shared-files relay
 *
 * This approach avoids the React Server Component serialization boundary issue
 * by passing plain objects instead of class instances to the client component.
 */
export async function ServerSideVisualizationWrapper({
  accessToken,
  allowedOrigins,
  identifier,
  isFullHeight = false,
  isPdfMode = false,
  catalog,
}: ServerSideVisualizationWrapperProps) {
  let prefetchedCode: string | undefined;
  let isAuthenticatedMember = false;

  try {
    const headers: Record<string, string> = {};

    // Retrieve content of the visualization using the access token.
    headers["Authorization"] = `Bearer ${accessToken}`;
    const endpoint = `${process.env.DUST_FRONT_API}/api/v1/viz/content`;

    const codeResponse = await fetch(endpoint, {
      headers,
      cache: "no-store",
    });

    if (codeResponse.ok) {
      const responseData = await codeResponse.json();
      prefetchedCode = responseData.content;
      isAuthenticatedMember = responseData.isAuthenticatedMember ?? false;

      if (!prefetchedCode) {
        logger.warn({ identifier }, "No code content found for visualization");
        prefetchedCode = undefined;

        return;
      }
    } else {
      logger.warn(
        { identifier, statusCode: codeResponse.status },
        "Failed to fetch code"
      );
    }
  } catch (err) {
    logger.error({ err }, "Error pre-fetching code:");
  }

  return (
    <ServerVisualizationWrapperClient
      allowedOrigins={allowedOrigins}
      identifier={identifier}
      isFullHeight={isFullHeight}
      isPdfMode={isPdfMode}
      prefetchedCode={prefetchedCode}
      accessToken={accessToken}
      isAuthenticatedMember={isAuthenticatedMember}
      catalog={catalog}
    />
  );
}
