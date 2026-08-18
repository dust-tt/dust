import type { PersonalAuthResolutionOutcome } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { PersonalAuthenticationCard } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import type { FrameViewer } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { SandboxFunctionToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { useResolveAuthentication } from "@app/lib/swr/tool_actions";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

interface SandboxFunctionPersonalAuthCardProps {
  // Every invocation blocked on this MCP server: one trip through the authentication flow resolves
  // them all, so they must not be presented (and resolved) one card at a time.
  events: SandboxFunctionToolPersonalAuthRequiredEvent[];
  // Viewer context is passed in: shared frames render this card outside of any AuthProvider.
  viewer: FrameViewer;
  onResolved: () => void;
}

export function SandboxFunctionPersonalAuthCard({
  events,
  viewer,
  onResolved,
}: SandboxFunctionPersonalAuthCardProps) {
  const [{ authError, metadata }] = events;

  const { resolveAuthentication, isResolving } = useResolveAuthentication({
    owner: viewer.owner,
  });

  const handleResolve = async (
    outcome: PersonalAuthResolutionOutcome
  ): Promise<boolean> => {
    for (const event of events) {
      const result = await resolveAuthentication({
        contextType: "sandbox_function",
        sandboxFunctionId: event.sandboxFunctionId,
        invocationId: event.invocationId,
        actionId: event.actionId,
        outcome,
      });

      if (!result.success) {
        return false;
      }
    }

    onResolved();
    return true;
  };

  return (
    <PersonalAuthenticationCard
      triggeringUser={viewer.user}
      currentUser={viewer.user}
      actionLabel={metadata.displayLabel ?? asDisplayName(metadata.toolName)}
      mcpServerId={authError.mcpServerId}
      owner={viewer.owner}
      provider={authError.provider}
      scope={authError.scope}
      isResolving={isResolving}
      onResolve={handleResolve}
    />
  );
}
