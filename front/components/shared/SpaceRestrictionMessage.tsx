import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Users01 } from "@dust-tt/sparkle";

interface SpaceRestrictionMessageProps {
  entityName: "agent" | "skill";
  owner: LightWorkspaceType;
  spaces: SpaceType[];
}

export function SpaceRestrictionMessage({
  entityName,
  owner,
  spaces,
}: SpaceRestrictionMessageProps) {
  if (spaces.length === 0) {
    return null;
  }

  const spaceLinks = <SpaceLinks owner={owner} spaces={spaces} />;

  return (
    <div className="mb-4 w-full">
      <ContentMessage
        variant="golden"
        size="lg"
        title={`Who can use this ${entityName}?`}
        icon={Users01}
      >
        {spaces.length === 1 ? (
          <>
            Only users with access to {spaceLinks} can view and use this{" "}
            {entityName}.
          </>
        ) : (
          <>
            Only users with access to all of the following can view and use this{" "}
            {entityName}: {spaceLinks}.
          </>
        )}
      </ContentMessage>
    </div>
  );
}
