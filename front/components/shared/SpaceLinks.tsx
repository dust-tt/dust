import { getPodRoute, getSpaceRoute } from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { Hoverable } from "@dust-tt/sparkle";
import { Fragment } from "react";

interface SpaceLinksProps {
  owner: LightWorkspaceType;
  spaces: SpaceType[];
}

export function SpaceLinks({ owner, spaces }: SpaceLinksProps) {
  return (
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
}
