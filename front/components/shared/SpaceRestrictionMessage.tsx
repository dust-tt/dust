import { getPodRoute, getSpaceRoute } from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Hoverable, Users01 } from "@dust-tt/sparkle";
import { Fragment } from "react";

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

  const spaceLinks = (
    <strong>
      {spaces.map((space, index) => (
        <Fragment key={space.sId}>
          {index > 0 && <span className="mr-0.5">, </span>}
          <Hoverable
            variant="primary"
            className="text-inherit underline hover:font-medium"
            href={
              isProjectType(space)
                ? getPodRoute(owner.sId, space.sId)
                : getSpaceRoute(owner.sId, space.sId)
            }
            target="_blank"
          >
            {space.name}
          </Hoverable>
        </Fragment>
      ))}
    </strong>
  );

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
            Only users with access to {spaceLinks} can read and use this{" "}
            {entityName}.
          </>
        ) : (
          <>
            Only users with access to all of the following can read and use this{" "}
            {entityName}: {spaceLinks}.
          </>
        )}
      </ContentMessage>
    </div>
  );
}
