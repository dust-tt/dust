import { ClientVisualizationWrapper } from "@viz/app/content/ClientVisualizationWrapper";
import { ServerSideVisualizationWrapper } from "@viz/app/content/ServerVisualizationWrapper";
import { getVizCatalog } from "@viz/app/lib/i18n/catalogs";
import { resolveVizLocale } from "@viz/app/lib/i18n/resolveVizLocale";
import { headers } from "next/headers";

interface RenderVisualizationSearchParams {
  accessToken?: string;
  editable?: string;
  /** When "true", EditableFrame uses click + staged commits (Frames v2 Edit). */
  stagedEdits?: string;
  fullHeight?: string;
  identifier?: string;
  pdfMode?: string;
  /**
   * Front's active locale; absent outside the app (public frames), which use Accept-Language.
   * An array when `?locale=` is repeated.
   */
  locale?: string | string[];
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

  const {
    accessToken,
    editable,
    stagedEdits,
    fullHeight,
    identifier,
    pdfMode,
    locale: localeParam,
  } = searchParams;

  const isEditable = editable === "true";
  const isStagedEdits = stagedEdits === "true";
  const isFullHeight = fullHeight === "true";
  const isPdfMode = pdfMode === "true";
  // Resolved here rather than in the browser, so that server and client render the same language,
  // and only that language's catalog is sent to the browser.
  const catalog = getVizCatalog(
    resolveVizLocale({
      // A repeated `?locale=` uses its first value.
      localeParam: Array.isArray(localeParam) ? localeParam[0] : localeParam,
      acceptLanguage: headers().get("accept-language"),
    })
  );

  // Use SSR approach for access tokens (publicly accessible).
  // Workspace members can access live files through the authenticated RPC bridge.
  if (accessToken) {
    return (
      <ServerSideVisualizationWrapper
        accessToken={accessToken}
        allowedOrigins={allowedOrigins}
        identifier={identifier!}
        isFullHeight={isFullHeight}
        isPdfMode={isPdfMode}
        catalog={catalog}
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
        stagedEdits={isStagedEdits}
        isFullHeight={isFullHeight}
        catalog={catalog}
      />
    );
  }

  return <div>Missing access token or identifier</div>;
}
