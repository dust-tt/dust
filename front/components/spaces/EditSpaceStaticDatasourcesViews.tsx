import { BrandbookCreationModal } from "@app/components/data_source/BrandbookCreationModal";
import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";
import SpaceWebsiteModal from "@app/components/spaces/websites/SpaceWebsiteModal";
import { useKillSwitches } from "@app/lib/swr/kill";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { Button, PlusIcon, Tooltip } from "@dust-tt/sparkle";

interface EditSpaceStaticDatasourcesViewsProps {
  canWriteInSpace: boolean;
  category: "folder" | "website" | "brandbook";
  dataSourceView: DataSourceViewType | null;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  owner: WorkspaceType;
  space: SpaceType;
}

const CATEGORY_BUTTON_LABELS: Record<"folder" | "website" | "brandbook", string> = {
  folder: "Add folder",
  website: "Add website",
  brandbook: "New Brandbook",
};

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
      label={CATEGORY_BUTTON_LABELS[category]}
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
      ) : category === "brandbook" ? (
        <BrandbookCreationModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          space={space}
          onCreated={onClose}
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
