import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Users01 } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface SkillBuilderAvailabilityMessageProps {
  availability: SkillAvailability;
  owner: LightWorkspaceType;
  restrictedSpaces: SpaceType[];
}

function getAvailabilityContent({
  availability,
  owner,
  restrictedSpaces,
}: SkillBuilderAvailabilityMessageProps): ReactNode {
  if (restrictedSpaces.length === 0) {
    return availability === "editors"
      ? "Only editors can find it via the input bar and agent builder. Non-editors can still use it through any agent or skill that includes this skill."
      : "Everyone in the workspace can find it via the input bar and agent builder.";
  }

  const spaceLinks = <SpaceLinks owner={owner} spaces={restrictedSpaces} />;
  const spacesPhrase =
    restrictedSpaces.length > 1 ? (
      <>all of the following: {spaceLinks}</>
    ) : (
      spaceLinks
    );

  const gate = (
    <>
      Nobody can use this skill in any context unless they are a member of{" "}
      {spacesPhrase}.
    </>
  );

  switch (availability) {
    case "editors":
      return gate;
    case "workspace_users":
      return (
        <>{gate} Members can find it via the input bar and agent builder.</>
      );
    case "users_and_agents":
      return (
        <>
          {gate} Members can find it via the input bar and agent builder, and
          agents with Discover Skills can use it automatically.
        </>
      );
    default:
      assertNeverAndIgnore(availability);
      return gate;
  }
}

export function SkillBuilderAvailabilityMessage({
  availability,
  owner,
  restrictedSpaces,
}: SkillBuilderAvailabilityMessageProps) {
  const hasSpaceRestrictions = restrictedSpaces.length > 0;

  const content = getAvailabilityContent({
    availability,
    owner,
    restrictedSpaces,
  });

  return (
    <ContentMessage
      variant={hasSpaceRestrictions ? "info" : "primary"}
      size="lg"
      title="Who can use this skill?"
      icon={Users01}
    >
      {content}
    </ContentMessage>
  );
}
