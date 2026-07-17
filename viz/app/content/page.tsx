import { ClientVisualizationWrapper } from "@viz/app/content/ClientVisualizationWrapper";
import { ServerSideVisualizationWrapper } from "@viz/app/content/ServerVisualizationWrapper";

interface RenderVisualizationSearchParams {
  accessToken?: string;
  editable?: string;
  fullHeight?: string;
  identifier?: string;
  pdfMode?: string;
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

  const { accessToken, editable, fullHeight, identifier, pdfMode } =
    searchParams;

  const isEditable = editable === "true";
  const isFullHeight = fullHeight === "true";
  const isPdfMode = pdfMode === "true";

  // Use SSR approach for access tokens (publicly accessible).
  // Editing is not available for public shared frames.
  if (accessToken) {
    return (
      <ServerSideVisualizationWrapper
        accessToken={accessToken}
        allowedOrigins={allowedOrigins}
        identifier={identifier!}
        isFullHeight={isFullHeight}
        isPdfMode={isPdfMode}
      />
    );
  }

  // Use RPC approach for regular identifiers (other flows).
  if (identifier) {
    return (
      <ClientVisualizationWrapper
        identifier={identifier}
        allowedOrigins={allowedOrigins}
        isEditable={isEditable}
        isFullHeight={isFullHeight}
      />
    );
  }

  return <div>Missing access token or identifier</div>;
}
