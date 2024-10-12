import { Button, Chip, StarIcon, StarStrokeIcon } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import React, { useState } from "react";

import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";

interface AssistantFavoriteActions {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isParentHovered: boolean;
}

export default function AssistantFavoriteActions({
  agentConfiguration,
  isParentHovered,
  owner,
}: AssistantFavoriteActions) {
  const doUpdate = useUpdateUserFavorite({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  // Use the function to set the initial state.
  const [isUserFavorite, setIsUserFavorite] = useState(
    () => agentConfiguration.userFavorite
  );

  const updateFavorite = async (favorite: boolean) => {
    const success = await doUpdate(favorite);
    if (success) {
      setIsUserFavorite(favorite);
    }
  };

  return (
    <div className="group">
      {isUserFavorite && (
        <Chip
          label="Favorite"
          icon={StarIcon}
          className={isUserFavorite ? "group-hover:hidden" : "hidden"}
        />
      )}
      <div
        className={classNames(
          "hidden",
          isUserFavorite ? "group-hover:block" : ""
        )}
      >
        <Button
          label={"Remove from favorites"}
          size="xs"
          hasMagnifying={false}
          variant="tertiary"
          icon={StarStrokeIcon}
          onClick={(e) => {
            e.stopPropagation();
            return updateFavorite(false);
          }}
        />
      </div>
      <div
        className={
          isParentHovered && !isUserFavorite ? "group-hover:block" : "hidden"
        }
      >
        <Button
          label={"Add to favorites"}
          size="xs"
          hasMagnifying={false}
          variant="tertiary"
          icon={StarIcon}
          onClick={(e) => {
            e.stopPropagation();
            return updateFavorite(true);
          }}
        />
      </div>
    </div>
  );
}
