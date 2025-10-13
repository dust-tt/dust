import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
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
  UserType,
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
  user: UserType;
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

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

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

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  if (duplicate) {
    configuration = await getAgentConfiguration(auth, {
      agentId: duplicate,
      variant: "full",
    });

    if (!configuration) {
      return {
        notFound: true,
      };
    }
    // We reset the scope according to the current flow. This ensures that cloning a workspace
    // agent with flow `personal_assistants` will initialize the agent as private.
    configuration.scope = flow === "personal_assistants" ? "hidden" : "visible";
  }

  const user = auth.getNonNullableUser().toJSON();

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
      user,
    },
  };
});

export default function CreateAgent({
  agentConfiguration,
  owner,
  user,
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
    <AgentBuilderProvider
      owner={owner}
      user={user}
      assistantTemplate={assistantTemplate}
    >
      <AgentBuilder
        agentConfiguration={
          agentConfiguration && "sId" in agentConfiguration
            ? agentConfiguration
            : undefined
        }
        duplicateAgentId={duplicateAgentId}
      />
    </AgentBuilderProvider>
  );
}

CreateAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
