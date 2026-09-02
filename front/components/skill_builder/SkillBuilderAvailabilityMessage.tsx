import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Users01 } from "@dust-tt/sparkle";

interface SkillBuilderAvailabilityMessageProps {
  availability: SkillAvailability;
  owner: LightWorkspaceType;
  restrictedSpaces: SpaceType[];
}

function getAvailabilityItems(
  availability: SkillAvailability,
  restricted: boolean
): string[] {
  switch (availability) {
    case "editors":
      return [
        "Only editors can find it via the composer and agent builder",
        "The skill remains available through agents and skills that use it",
      ];
    case "workspace_users":
      // When restricted, "All members" contradicts the space gate above, so we
      // refer back to the gated members with "They can all".
      return [
        `${restricted ? "They can all" : "All members can"} find it via the composer and agent builder`,
      ];
    case "users_and_agents":
      return [
        "All members can find it via the composer and agent builder",
        "Agents with Discover Skills can use it automatically",
      ];
    default:
      assertNeverAndIgnore(availability);
      return [];
  }
}

export function SkillBuilderAvailabilityMessage({
  availability,
  owner,
  restrictedSpaces,
}: SkillBuilderAvailabilityMessageProps) {
  const restricted = restrictedSpaces.length > 0;
  const items = getAvailabilityItems(availability, restricted);

  const spaceLinks = <SpaceLinks owner={owner} spaces={restrictedSpaces} />;

  const gate = !restricted ? null : restrictedSpaces.length > 1 ? (
    <>
      Only members of all the following can view and use this skill:{" "}
      {spaceLinks}.
    </>
  ) : (
    <>Only members of {spaceLinks} can view and use this skill.</>
  );

  // A single availability line reads better as one sentence than as a
  // gate-plus-one-bullet list, so we inline it after the gate.
  const isSingle = items.length === 1;

  return (
    <ContentMessage
      size="lg"
      variant="primary"
      title="Who is this skill available for?"
      icon={Users01}
    >
      {isSingle ? (
        <p>
          {gate && <>{gate} </>}
          {items[0]}
          {restricted ? "." : ""}
        </p>
      ) : (
        <>
          {gate && <p className="mb-1">{gate} Among them:</p>}
          <ul className="list-disc space-y-1 pl-5">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </ContentMessage>
  );
}
