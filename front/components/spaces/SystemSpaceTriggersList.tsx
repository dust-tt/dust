import * as React from "react";
import { useCallback, useMemo, useState } from "react";

import { useQueryParams } from "@app/hooks/useQueryParams";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpaceTriggersListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SystemSpaceTriggersList = ({
  owner,
  isAdmin,
  space,
}: SpaceTriggersListProps) => {
  if (!isAdmin) {
    return null;
  }

  return <>hello</>;
};
