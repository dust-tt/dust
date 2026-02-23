import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useSearchParam } from "@app/lib/platform";
import {
  useAgentConfiguration,
  useAssistantTemplate,
} from "@app/lib/swr/assistants";
import Custom404 from "@app/pages/404";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import { Spinner } from "@dust-tt/sparkle";

function isBuilderFlow(value: string): value is BuilderFlow {
  return BUILDER_FLOWS.some((flow) => flow === value);
}

export function NewAgentPage() {
  const owner = useWorkspace();
  const { user, isAdmin, isBuilder } = useAuth();
  const { featureFlags, hasFeature } = useFeatureFlags();

  const flowParam = useSearchParam("flow");
  const flow: BuilderFlow =
    flowParam && isBuilderFlow(flowParam) ? flowParam : "personal_assistants";

  const duplicateAgentId = useSearchParam("duplicate");
  const templateId = useSearchParam("templateId");
  const conversationId = useSearchParam("conversationId");

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") && !isBuilder;

  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: duplicateAgentId,
    disabled: !duplicateAgentId,
  });

  const shouldPassConversationId =
    hasFeature("agent_builder_copilot") &&
    isAdmin &&
    agentConfiguration === null;

  const {
    assistantTemplate,
    isAssistantTemplateLoading,
    isAssistantTemplateError,
  } = useAssistantTemplate({ templateId });

  let duplicateConfiguration: AgentConfigurationType | null = null;
  if (agentConfiguration && duplicateAgentId) {
    const scope: AgentConfigurationScope =
      flow === "personal_assistants" ? "hidden" : "visible";
    duplicateConfiguration =
      agentConfiguration.scope === scope
        ? agentConfiguration
        : { ...agentConfiguration, scope };
  }

  const isDuplicateLoading = !!duplicateAgentId && isAgentConfigurationLoading;

  if (isRestrictedFromAgentCreation) {
    return <Custom404 />;
  }

  if (
    (duplicateAgentId &&
      (isAgentConfigurationError ||
        (!isAgentConfigurationLoading && !agentConfiguration))) ||
    (templateId &&
      (isAssistantTemplateError ||
        (!isAssistantTemplateLoading && !assistantTemplate)))
  ) {
    return <Custom404 />;
  }

  if (isDuplicateLoading || (templateId && isAssistantTemplateLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (duplicateConfiguration) {
    throwIfInvalidAgentConfiguration(duplicateConfiguration);
  }

  return (
    <AgentBuilderProvider
      owner={owner}
      user={user}
      isAdmin={isAdmin}
      assistantTemplate={assistantTemplate}
    >
      <AgentBuilder
        agentConfiguration={duplicateConfiguration ?? undefined}
        duplicateAgentId={duplicateAgentId}
        conversationId={
          shouldPassConversationId ? (conversationId ?? undefined) : undefined
        }
      />
    </AgentBuilderProvider>
  );
}
