import { ServerVisualizationWrapper } from "@viz/app/content/ServerVisualizationWrapper";

type RenderVisualizationSearchParams = {
  identifier: string;
  fullHeight?: string;
};

const { ALLOWED_VISUALIZATION_ORIGIN } = process.env;

export default function RenderVisualization({
  searchParams,
}: {
  searchParams: RenderVisualizationSearchParams;
}) {
  const isFullHeight = searchParams.fullHeight === "true";
  const allowedOrigins = ALLOWED_VISUALIZATION_ORIGIN
    ? ALLOWED_VISUALIZATION_ORIGIN.split(",").map((s) => s.trim())
    : [];

  const identifier = searchParams.identifier;

  if (!identifier) {
    return <div>Missing identifier</div>;
  }

  return (
    <ServerVisualizationWrapper
      identifier={searchParams.identifier}
      allowedOrigins={allowedOrigins}
      isFullHeight={isFullHeight}
    />
  );
}
