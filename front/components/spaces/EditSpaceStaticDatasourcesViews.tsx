import { Button, PlusIcon, Tooltip } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";

import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";
import SpaceWebsiteModal from "@app/components/spaces/websites/SpaceWebsiteModal";
import { useKillSwitches } from "@app/lib/swr/kill";

interface EditSpaceStaticDatasourcesViewsProps {
  canWriteInSpace: boolean;
  category: "folder" | "website";
  dataSourceView: DataSourceViewType | null;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  owner: WorkspaceType;
  space: SpaceType;
}

export function EditSpaceStaticDatasourcesViews({
  canWriteInSpace,
  category,
  dataSourceView,
  isOpen,
  onClose,
  onOpen,
  owner,
  space,
}: EditSpaceStaticDatasourcesViewsProps) {
  const { killSwitches } = useKillSwitches();

  const isSavingDisabled = killSwitches?.includes("save_data_source_views");

  const addToSpaceButton = (
    <Button
      label={`Add ${category}`}
      onClick={onOpen}
      icon={PlusIcon}
      disabled={!canWriteInSpace || isSavingDisabled}
    />
  );

  return (
    <>
      {category === "folder" ? (
        <SpaceFolderModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          space={space}
          dataSourceViewId={dataSourceView ? dataSourceView.sId : null}
        />
      ) : category === "website" ? (
        <SpaceWebsiteModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          space={space}
          dataSourceView={dataSourceView}
          canWriteInSpace={canWriteInSpace}
        />
      ) : null}
      {canWriteInSpace ? (
        isSavingDisabled ? (
          <Tooltip
            label="Editing spaces is temporarily disabled and will be re-enabled shortly."
            side="top"
            trigger={addToSpaceButton}
          />
        ) : (
          addToSpaceButton
        )
      ) : (
        <Tooltip
          label={
            space.kind === "global"
              ? `Only builders of the workspace can add a ${category} in the Company data space.`
              : `Only members of the space can add a ${category}.`
          }
          side="top"
          trigger={addToSpaceButton}
        />
      )}
    </>
  );
}
