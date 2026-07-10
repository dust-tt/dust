import type { PersonalAuthResolutionOutcome } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { PersonalAuthenticationCard } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { useResolveSandboxFunctionAuthentication } from "@app/hooks/useResolveSandboxFunctionAuthentication";
import type { SandboxFunctionToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { useAuth } from "@app/lib/auth/AuthContext";

interface SandboxFunctionPersonalAuthCardProps {
  event: SandboxFunctionToolPersonalAuthRequiredEvent;
  onResolved: () => void;
}

export function SandboxFunctionPersonalAuthCard({
  event,
  onResolved,
}: SandboxFunctionPersonalAuthCardProps) {
  const { user, workspace } = useAuth();

  const { resolveAuthentication, isResolving } =
    useResolveSandboxFunctionAuthentication({ owner: workspace });

  const handleResolve = async (
    outcome: PersonalAuthResolutionOutcome
  ): Promise<boolean> => {
    const result = await resolveAuthentication({
      sandboxFunctionId: event.sandboxFunctionId,
      invocationId: event.invocationId,
      actionId: event.actionId,
      outcome,
    });

    if (!result.success) {
      return false;
    }

    onResolved();
    return true;
  };

  return (
    <PersonalAuthenticationCard
      triggeringUser={user}
      mcpServerId={event.authError.mcpServerId}
      owner={workspace}
      provider={event.authError.provider}
      scope={event.authError.scope}
      isResolving={isResolving}
      onResolve={handleResolve}
    />
  );
}
