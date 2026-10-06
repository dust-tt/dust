import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Users01 } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

type AgentScope = AgentBuilderFormData["agentSettings"]["scope"];

interface AgentBuilderAvailabilityMessageProps {
  owner: LightWorkspaceType;
  restrictedSpaces: SpaceType[];
  scope: AgentScope;
}

function getAvailabilityMessage(
  scope: AgentScope,
  owner: LightWorkspaceType,
  restrictedSpaces: SpaceType[]
): ReactNode {
  const spaceLinks = <SpaceLinks owner={owner} spaces={restrictedSpaces} />;

  switch (scope) {
    case "hidden":
      if (restrictedSpaces.length === 0) {
        return <Trans>Only editors can view and use this agent.</Trans>;
      }

      return restrictedSpaces.length > 1 ? (
        <Trans>
          Only editors with access to all of the following can view and use this
          agent: {spaceLinks}.
        </Trans>
      ) : (
        <Trans>
          Only editors with access to {spaceLinks} can view and use this agent.
        </Trans>
      );
    case "visible":
      if (restrictedSpaces.length === 0) {
        return <Trans>All members can view and use this agent.</Trans>;
      }

      return restrictedSpaces.length > 1 ? (
        <Trans>
          Only members of all of the following can view and use this agent:{" "}
          {spaceLinks}.
        </Trans>
      ) : (
        <Trans>Only members of {spaceLinks} can view and use this agent.</Trans>
      );
    default:
      assertNeverAndIgnore(scope);
      return null;
  }
}

export function AgentBuilderAvailabilityMessage({
  owner,
  restrictedSpaces,
  scope,
}: AgentBuilderAvailabilityMessageProps) {
  const { t } = useLingui();
  return (
    <ContentMessage
      size="lg"
      variant="primary"
      title={t`Who is this agent available for?`}
      icon={Users01}
    >
      <p>{getAvailabilityMessage(scope, owner, restrictedSpaces)}</p>
    </ContentMessage>
  );
}
