import { ClientVisualizationWrapper } from "@viz/app/content/ClientVisualizationWrapper";
import { ServerSideVisualizationWrapper } from "@viz/app/content/ServerVisualizationWrapper";

interface RenderVisualizationSearchParams {
  accessToken?: string;
  fullHeight?: string;
  identifier?: string;
}

const { ALLOWED_VISUALIZATION_ORIGIN } = process.env;

export default function RenderVisualization({
  searchParams,
}: {
  searchParams: RenderVisualizationSearchParams;
}) {
  const allowedOrigins = ALLOWED_VISUALIZATION_ORIGIN
    ? ALLOWED_VISUALIZATION_ORIGIN.split(",").map((s) => s.trim())
    : [];

  const { accessToken, fullHeight, identifier } = searchParams;

  const isFullHeight = fullHeight === "true";

  // Use SSR approach for access tokens (publicly accessible).
  if (accessToken) {
    return (
      <ServerSideVisualizationWrapper
        accessToken={accessToken}
        allowedOrigins={allowedOrigins}
        identifier={identifier!}
        isFullHeight={isFullHeight}
      />
    );
  }

  // Use RPC approach for regular identifiers (other flows).
  if (identifier) {
    return (
      <ClientVisualizationWrapper
        identifier={identifier}
        allowedOrigins={allowedOrigins}
        isFullHeight={isFullHeight}
      />
    );
  }

  return <div>Missing access token or identifier</div>;
}
