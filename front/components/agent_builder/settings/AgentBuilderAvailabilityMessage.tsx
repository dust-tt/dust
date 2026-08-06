import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Users01 } from "@dust-tt/sparkle";
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
        return <>Only editors can view and use this agent.</>;
      }

      return restrictedSpaces.length > 1 ? (
        <>
          Only editors with access to all of the following can view and use this
          agent: {spaceLinks}.
        </>
      ) : (
        <>
          Only editors with access to {spaceLinks} can view and use this agent.
        </>
      );
    case "visible":
      if (restrictedSpaces.length === 0) {
        return <>All members can view and use this agent.</>;
      }

      return restrictedSpaces.length > 1 ? (
        <>
          Only members of all of the following can view and use this agent:{" "}
          {spaceLinks}.
        </>
      ) : (
        <>Only members of {spaceLinks} can view and use this agent.</>
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
  return (
    <ContentMessage
      size="lg"
      variant="primary"
      title="Who is this agent available for?"
      icon={Users01}
    >
      <p>{getAvailabilityMessage(scope, owner, restrictedSpaces)}</p>
    </ContentMessage>
  );
}
