import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import {
  REQUESTABLE_SPACE_KINDS,
  useSpaces,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import type { EnrichedSpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Chip, Spinner } from "@dust-tt/sparkle";
import sortBy from "lodash/sortBy";
import { useMemo } from "react";

interface RequestedSpacesSectionProps {
  owner: LightWorkspaceType;
  requestedSpaceIds: string[];
  // Spaces already loaded by the caller; skips fetching them.
  spaces?: EnrichedSpaceType[];
  // Whether the caller may not be a member of every requested space (an admin viewing a redacted
  // agent or skill): resolves them through the admin listing.
  resolveAsAdmin?: boolean;
}

export function RequestedSpacesSection({
  owner,
  requestedSpaceIds,
  spaces,
  resolveAsAdmin = false,
}: RequestedSpacesSectionProps) {
  const shouldLoadSpaces = requestedSpaceIds.length > 0 && !spaces;
  const { spaces: spacesFromHook, isSpacesLoading: isMemberSpacesLoading } =
    useSpaces({
      workspaceId: owner.sId,
      kinds: ["global", "regular", "project"],
      disabled: !shouldLoadSpaces,
    });
  const { spaces: spacesAsAdmin, isSpacesLoading: isAdminSpacesLoading } =
    useSpacesAsAdmin({
      workspaceId: owner.sId,
      kinds: REQUESTABLE_SPACE_KINDS,
      disabled: !isAdmin(owner) || !resolveAsAdmin || !shouldLoadSpaces,
    });

  const isSpacesLoading = isMemberSpacesLoading || isAdminSpacesLoading;

  const sortedSpaces = useMemo(() => {
    const resolvedSpaces =
      spaces ??
      Array.from(
        new Map(
          [...spacesFromHook, ...spacesAsAdmin].map((s) => [s.sId, s])
        ).values()
      );

    return sortBy(
      resolvedSpaces
        .filter((s) => requestedSpaceIds.includes(s.sId))
        .map((space) => ({
          space,
          name: getSpaceName(space),
          Icon: getSpaceIcon(space),
        })),
      "name"
    );
  }, [spaces, spacesFromHook, spacesAsAdmin, requestedSpaceIds]);

  if (requestedSpaceIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="heading-lg text-foreground">Spaces and Pods</div>
      {isSpacesLoading ? (
        <div className="flex flex-row items-center gap-2">
          <Spinner size="xs" />
        </div>
      ) : sortedSpaces.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sortedSpaces.map(({ space, name, Icon }) => (
            <Chip key={space.sId} label={name} size="sm">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
