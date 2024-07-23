import { VisualizationIframeContentWithErrorHandling } from "@app/components/assistant/conversation/actions/VisualizationIframeContent";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{ wId: string; aId: string }>(async (context) => {
  const { aId, wId } = context.query;
  if (typeof aId !== "string" || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      wId,
      aId,
    },
  };
});

export default function Iframe({ wId, aId }: { wId: string; aId: string }) {
  return (
    <VisualizationIframeContentWithErrorHandling
      workspaceId={wId}
      actionId={aId}
    />
  );
}
