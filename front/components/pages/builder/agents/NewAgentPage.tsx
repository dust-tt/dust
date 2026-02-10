import { Spinner } from "@dust-tt/sparkle";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import {
  useAgentConfiguration,
  useAssistantTemplate,
} from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
} from "@app/types";

function isBuilderFlow(value: string): value is BuilderFlow {
  return BUILDER_FLOWS.some((flow) => flow === value);
}

export function NewAgentPage() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const { user, isAdmin, isBuilder } = useAuth();

  const flowParam = useSearchParam("flow");
  const flow: BuilderFlow =
    flowParam && isBuilderFlow(flowParam) ? flowParam : "personal_assistants";

  const duplicateAgentId = useSearchParam("duplicate");
  const templateId = useSearchParam("templateId");
  // TODO(copilot 2026-02-10): hack to allow copilot to access draft templates, remove once done iterating on copilot template instructions.
  const copilotTemplateId = useSearchParam("copilotTemplateId");
  const conversationId = useSearchParam("conversationId");

  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });
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

  const shouldPassConversationId = agentConfiguration?.version === 0;

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

  if (isFeatureFlagsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isRestrictedFromAgentCreation) {
    void router.replace("/404");
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (
    (duplicateAgentId &&
      (isAgentConfigurationError ||
        (!isAgentConfigurationLoading && !agentConfiguration))) ||
    (templateId &&
      (isAssistantTemplateError ||
        (!isAssistantTemplateLoading && !assistantTemplate)))
  ) {
    void router.replace("/404");
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
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
        copilotTemplateId={copilotTemplateId}
        conversationId={
          shouldPassConversationId ? (conversationId ?? undefined) : undefined
        }
      />
    </AgentBuilderProvider>
  );
}
