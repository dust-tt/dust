import * as React from "react";

import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SystemSpaceTriggersList = ({
  owner,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  if (!isAdmin) {
    return null;
  }

  return <AdminTriggersList owner={owner} systemSpace={space} />;
};
