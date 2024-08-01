import { VisualizationWrapperWithErrorBoundary } from "@viz/app/components/VisualizationWrapper";

type RenderVisualizationSearchParams = {
  index: string;
};

const { ALLOWED_VISUALIZATION_ORIGIN } = process.env;

export default function RenderVisualization({
  searchParams,
}: {
  searchParams: RenderVisualizationSearchParams;
}) {
  return (
    <VisualizationWrapperWithErrorBoundary
      index={parseInt(searchParams.index, 10)}
      allowedVisualizationOrigin={ALLOWED_VISUALIZATION_ORIGIN}
    />
  );
}
