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
  
  return (
    <VisualizationWrapperWithErrorBoundary
      identifier={searchParams.identifier}
      allowedVisualizationOrigin={ALLOWED_VISUALIZATION_ORIGIN}
      isFullHeight={isFullHeight}
    />
  );
}
