import { Spinner } from "@dust-tt/sparkle";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

export function EditAgentPage() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const agentId = useRequiredPathParam("aId");

  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  if (
    isAgentConfigurationError ||
    (!isAgentConfigurationLoading && !agentConfiguration) ||
    (agentConfiguration && !agentConfiguration.canEdit && !isAdmin)
  ) {
    void router.replace("/404");
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAgentConfigurationLoading || !agentConfiguration) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global agent");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived agent");
  }

  return (
    <AgentBuilderProvider
      owner={owner}
      user={user}
      isAdmin={isAdmin}
      assistantTemplate={null}
    >
      <AgentBuilder agentConfiguration={agentConfiguration} />
    </AgentBuilderProvider>
  );
}
