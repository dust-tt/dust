import { VisualizationWrapperWithErrorBoundary } from "@viz/app/components/VisualizationWrapper";

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
  const isFullHeight = searchParams.fullHeight === 'true';
  const allowedOrigins = ALLOWED_VISUALIZATION_ORIGIN
    ? ALLOWED_VISUALIZATION_ORIGIN.split(',').map((s) => s.trim())
    : [];

  return (
    <VisualizationWrapperWithErrorBoundary
      identifier={searchParams.identifier}
      allowedOrigins={allowedOrigins}
      isFullHeight={isFullHeight}
    />
  );
}
