import VisualizationIframe from "@app/components/assistant/conversation/actions/VisualizationIframe";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AgentVisualizationAction } from "@app/lib/models/assistant/actions/visualization";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  generatedCode: string;
}>(async (context, auth) => {
  const { aId } = context.query;

  const owner = auth.workspace();
  if (!owner) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  if (!aId || typeof aId !== "string") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const agentVisualizationAction = await AgentVisualizationAction.findByPk(aId);

  if (!agentVisualizationAction || !agentVisualizationAction.generation) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  console.log("generatedCode", agentVisualizationAction.generation);

  const regex = /<visualization[^>]*>\s*([\s\S]*?)\s*<\/visualization>/;
  let extractedCode: string | null = null;
  const match = agentVisualizationAction.generation.match(regex);
  if (match && match[1]) {
    extractedCode = match[1];
  }
  if (!extractedCode) {
    throw new Error("No visualization code found");
  }
  return {
    props: {
      generatedCode: extractedCode,
      workspaceId: owner.sId,
      actionId: aId,
    },
  };
});

export default function Iframe({
  workspaceId,
  actionId,
}: {
  generatedCode: string;
  workspaceId: string;
  actionId: string;
}) {
  return <VisualizationIframe workspaceId={workspaceId} actionId={actionId} />;
}
