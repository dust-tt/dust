import { VisualizationWrapperWithErrorHandling } from "@viz/app/components/VisualizationWrapper";

type IframeProps = {
  wId: string;
  aId: string;
};

export default function Iframe({
  searchParams,
}: {
  searchParams: IframeProps;
}) {
  return <VisualizationWrapperWithErrorHandling actionId={searchParams.aId} />;
}
