import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { Icon, LinkWrapper } from "@dust-tt/sparkle";

interface RequestedSpacesListProps {
  owner?: LightWorkspaceType;
  requestedSpaceIds: string[];
  spacesById: Map<string, SpaceType>;
}

export function RequestedSpacesList({
  owner,
  requestedSpaceIds,
  spacesById,
}: RequestedSpacesListProps) {
  if (requestedSpaceIds.length === 0) {
    return <div>None</div>;
  }

  return (
    <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
      {requestedSpaceIds.map((spaceId) => {
        const space = spacesById.get(spaceId);
        if (!space) {
          return (
            <span
              key={spaceId}
              className="text-sm text-muted-foreground dark:text-muted-foreground-night"
            >
              {spaceId} (unknown)
            </span>
          );
        }

        const spaceLabel = (
          <div key={spaceId} className="flex items-center gap-1.5">
            <Icon visual={getSpaceIcon(space)} size="xs" className="shrink-0" />
            {owner ? (
              <LinkWrapper
                href={`/poke/${owner.sId}/spaces/${space.sId}`}
                className="text-highlight-500"
              >
                {getSpaceName(space)}
              </LinkWrapper>
            ) : (
              <span>{getSpaceName(space)}</span>
            )}
          </div>
        );

        return spaceLabel;
      })}
    </div>
  );
}
