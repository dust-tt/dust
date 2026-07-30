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

function getAvailabilityItems(
  availability: SkillAvailability,
  { restricted }: { restricted: boolean }
): ReactNode[] {
  const everyoneCanFind = restricted
    ? "All members can find it via the input bar and agent builder"
    : "All workspace members can find it via the input bar and agent builder";

  switch (availability) {
    case "editors":
      return [
        "Only editors can find it via the input bar and agent builder",
        "The skill remains available through agents and skills that include it",
      ];
    case "workspace_users":
      return [everyoneCanFind];
    case "users_and_agents":
      return [
        everyoneCanFind,
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
  const items = getAvailabilityItems(availability, { restricted });

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
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </ContentMessage>
  );
}
