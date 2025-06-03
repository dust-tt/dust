import tracer from "dd-trace";
import type { InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantBuilderProvider } from "@app/components/assistant_builder/AssistantBuilderContext";
import { getAccessibleSourcesAndApps } from "@app/components/assistant_builder/server_side_props_helpers";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AppType,
  DataSourceViewType,
  LightAgentConfigurationType,
  PlanType,
  SpaceType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  agentConfiguration: LightAgentConfigurationType;
  agentEditors: UserType[];
  baseUrl: string;
  dataSourceViews: DataSourceViewType[];
  dustApps: AppType[];
  mcpServerViews: MCPServerViewType[];
  flow: BuilderFlow;
  owner: WorkspaceType;
  plan: PlanType;
  spaces: SpaceType[];
  subscription: SubscriptionType;
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

    const [
      { spaces, dataSourceViews, dustApps, mcpServerViews },
      configuration,
    ] = await Promise.all([
      getAccessibleSourcesAndApps(auth),
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

    const flow: BuilderFlow = BUILDER_FLOWS.includes(
      context.query.flow as BuilderFlow
    )
      ? (context.query.flow as BuilderFlow)
      : "personal_assistants";

    const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

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

    return {
      props: {
        agentConfiguration: configuration,
        agentEditors,
        baseUrl: config.getClientFacingUrl(),
        dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
        dustApps: dustApps.map((a) => a.toJSON()),
        mcpServerViews: mcpServerViewsJSON,
        flow,
        owner,
        plan,
        subscription,
        spaces: spaces.map((s) => s.toJSON()),
      },
    };
  });
});

export default function EditAssistant({
  agentConfiguration,
  agentEditors,
  baseUrl,
  spaces,
  dataSourceViews,
  dustApps,
  mcpServerViews,
  flow,
  owner,
  plan,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global agent");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived agent");
  }

  return (
    <AssistantBuilderProvider
      spaces={spaces}
      dustApps={dustApps}
      dataSourceViews={dataSourceViews}
      mcpServerViews={mcpServerViews}
    >
      <AssistantBuilder
        owner={owner}
        subscription={subscription}
        plan={plan}
        flow={flow}
        initialBuilderState={{
          scope: agentConfiguration.scope,
          handle: agentConfiguration.name,
          description: agentConfiguration.description,
          instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
          avatarUrl: agentConfiguration.pictureUrl,
          generationSettings: {
            modelSettings: {
              modelId: agentConfiguration.model.modelId,
              providerId: agentConfiguration.model.providerId,
              reasoningEffort: agentConfiguration.model.reasoningEffort,
            },
            temperature: agentConfiguration.model.temperature,
            responseFormat: agentConfiguration.model.responseFormat,
          },
          actions: [], // Actions will be populated later from the client
          visualizationEnabled: agentConfiguration.visualizationEnabled,
          maxStepsPerRun: agentConfiguration.maxStepsPerRun,
          templateId: agentConfiguration.templateId,
          tags: agentConfiguration.tags,
          editors: agentEditors,
        }}
        agentConfiguration={agentConfiguration}
        baseUrl={baseUrl}
        defaultTemplate={null}
      />
    </AssistantBuilderProvider>
  );
}

EditAssistant.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
