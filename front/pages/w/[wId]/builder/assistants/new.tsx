import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantBuilderProviders } from "@app/components/assistant_builder/contexts/AssistantBuilderContexts";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import type {
  AgentConfigurationType,
  PlanType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  WorkspaceType,
} from "@app/types";

function getDuplicateAndTemplateIdFromQuery(query: ParsedUrlQuery) {
  const { duplicate, templateId } = query;

  return {
    duplicate: duplicate && typeof duplicate === "string" ? duplicate : null,
    templateId:
      templateId && typeof templateId === "string" ? templateId : null,
  };
}

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  agentConfiguration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null;
  flow: BuilderFlow;
  baseUrl: string;
  templateId: string | null;
  duplicateAgentId: string | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const isRestricted = await isRestrictedFromAgentCreation(owner);
  if (isRestricted) {
    return {
      notFound: true,
    };
  }

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  let configuration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null = null;
  const { duplicate, templateId } = getDuplicateAndTemplateIdFromQuery(
    context.query
  );
  if (duplicate) {
    configuration = await getAgentConfiguration(auth, duplicate, "full");

    if (!configuration) {
      return {
        notFound: true,
      };
    }
    // We reset the scope according to the current flow. This ensures that cloning a workspace
    // agent with flow `personal_assistants` will initialize the agent as private.
    configuration.scope = flow === "personal_assistants" ? "hidden" : "visible";
  } else if (templateId) {
    const agentConfigRes = await generateMockAgentConfigurationFromTemplate(
      templateId,
      flow
    );

    if (agentConfigRes.isErr()) {
      return {
        notFound: true,
      };
    }

    configuration = agentConfigRes.value;
  }

  return {
    props: {
      agentConfiguration: configuration,
      baseUrl: config.getClientFacingUrl(),
      flow,
      owner,
      plan,
      subscription,
      templateId,
      duplicateAgentId: duplicate,
    },
  };
});

export default function CreateAssistant({
  agentConfiguration,
  baseUrl,
  flow,
  owner,
  plan,
  subscription,
  templateId,
  duplicateAgentId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { assistantTemplate } = useAssistantTemplate({ templateId });

  if (agentConfiguration) {
    throwIfInvalidAgentConfiguration(agentConfiguration);
  }

  if (templateId && !assistantTemplate) {
    return null;
  }

  return (
    <AssistantBuilderProviders owner={owner}>
      <AssistantBuilder
        owner={owner}
        subscription={subscription}
        plan={plan}
        flow={flow}
        duplicateAgentId={duplicateAgentId}
        initialBuilderState={
          agentConfiguration
            ? {
                actions: [],
                scope:
                  agentConfiguration.scope !== "global"
                    ? agentConfiguration.scope
                    : "hidden",
                handle: `${agentConfiguration.name}${
                  "isTemplate" in agentConfiguration ? "" : "_Copy"
                }`,
                description: agentConfiguration.description,
                instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
                avatarUrl:
                  "pictureUrl" in agentConfiguration
                    ? agentConfiguration.pictureUrl
                    : null,
                generationSettings: {
                  modelSettings: {
                    providerId: agentConfiguration.model.providerId,
                    modelId: agentConfiguration.model.modelId,
                  },
                  temperature: agentConfiguration.model.temperature,
                  reasoningEffort:
                    agentConfiguration.model.reasoningEffort || "none",
                  responseFormat: agentConfiguration.model.responseFormat,
                },
                visualizationEnabled: agentConfiguration.visualizationEnabled,
                templateId: templateId,
                tags: agentConfiguration.tags.filter(
                  (tag) => tag.kind !== "protected"
                ),
                // either new, or template, or duplicate, so initially no editors
                editors: [],
              }
            : null
        }
        agentConfiguration={null}
        defaultIsEdited={assistantTemplate !== null}
        baseUrl={baseUrl}
        defaultTemplate={assistantTemplate}
      />
    </AssistantBuilderProviders>
  );
}

CreateAssistant.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
