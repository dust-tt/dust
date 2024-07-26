import { VisualizationWrapperWithErrorBoundary } from "@viz/app/components/VisualizationWrapper";

type RenderVisualizationSearchParams = {
  aId: string;
};

const { ALLOWED_VISUALIZATION_ORIGIN } = process.env;

export default function RenderVisualization({
  searchParams,
}: {
  searchParams: RenderVisualizationSearchParams;
}) {
  return (
    <VisualizationWrapperWithErrorBoundary
      actionId={parseInt(searchParams.aId, 10)}
      allowedVisualizationOrigin={ALLOWED_VISUALIZATION_ORIGIN}
    />
  );
}
