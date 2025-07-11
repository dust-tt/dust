import tracer from "dd-trace";
import type { InferGetServerSidePropsType } from "next";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  user: UserType;
}>(async (context, auth) => {
  return tracer.trace("getServerSideProps", async () => {
    const owner = auth.workspace();
    const plan = auth.plan();
    const subscription = auth.subscription();
    if (
      !owner ||
      !plan ||
      !subscription ||
      !auth.isUser() ||
      !context.params?.aId
    ) {
      return {
        notFound: true,
      };
    }

    const featureFlags = await getFeatureFlags(owner);
    if (!featureFlags.includes("agent_builder_v2") || !auth.isBuilder()) {
      return {
        notFound: true,
      };
    }

    const [configuration] = await Promise.all([
      getAgentConfiguration(auth, context.params?.aId as string, "light"),
      MCPServerViewResource.ensureAllAutoToolsAreCreated(auth),
    ]);

    if (!configuration) {
      return {
        notFound: true,
      };
    }

    if (!configuration.canEdit && !auth.isAdmin()) {
      return {
        notFound: true,
      };
    }

    const user = auth.getNonNullableUser().toJSON();

    return {
      props: {
        agentConfiguration: configuration,
        owner,
        user,
      },
    };
  });
});

export default function EditAgent({
  agentConfiguration,
  owner,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global agent");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived agent");
  }

  return (
    <AgentBuilderProvider owner={owner} user={user}>
      <AgentBuilder agentConfiguration={agentConfiguration} />
    </AgentBuilderProvider>
  );
}

EditAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
