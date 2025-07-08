import tracer from "dd-trace";
import type { InferGetServerSidePropsType } from "next";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  PlanType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  agentConfiguration: AgentConfigurationType;
  agentEditors: UserType[];
  baseUrl: string;
  owner: WorkspaceType;
  plan: PlanType;
  subscription: SubscriptionType;
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
      getAgentConfiguration(auth, context.params?.aId as string, "full"),
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

    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      auth,
      configuration
    );
    if (editorGroupRes.isErr()) {
      throw new Error("Failed to find editor group for agent");
    }

    const agentEditors = (
      await editorGroupRes.value.getActiveMembers(auth)
    ).map((m) => m.toJSON());

    const user = auth.getNonNullableUser().toJSON();

    return {
      props: {
        agentConfiguration: configuration,
        agentEditors,
        baseUrl: config.getClientFacingUrl(),
        owner,
        plan,
        subscription,
        user,
      },
    };
  });
});

export default function EditAgent({
  agentConfiguration,
  agentEditors,
  baseUrl,
  owner,
  plan,
  subscription,
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
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          <DataSourceViewsProvider owner={owner}>
            <AgentBuilder
              agentConfiguration={agentConfiguration}
              agentEditors={agentEditors}
            />
          </DataSourceViewsProvider>
        </MCPServerViewsProvider>
      </SpacesProvider>
    </AgentBuilderProvider>
  );
}

EditAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
