import { VisualizationIframeContentWithErrorHandling } from "@viz/components/VisualizationIframeContent";

type IframeProps = {
  wId: string;
  aId: string;
};

export default function Iframe({
  searchParams,
}: {
  searchParams: IframeProps;
}) {
  return (
    <VisualizationIframeContentWithErrorHandling
      workspaceId={searchParams.wId}
      actionId={searchParams.aId}
    />
  );
}
