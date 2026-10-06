import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";
import SpaceWebsiteModal from "@app/components/spaces/websites/SpaceWebsiteModal";
import { useKillSwitches } from "@app/lib/swr/kill";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { Button, Plus, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const { killSwitches } = useKillSwitches();

  const isSavingDisabled = killSwitches?.includes("save_data_source_views");

  const addToSpaceButton = (
    <Button
      label={category === "folder" ? t`Add folder` : t`Add website`}
      onClick={onOpen}
      icon={Plus}
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
            label={t`Editing spaces is temporarily disabled and will be re-enabled shortly.`}
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
              ? category === "folder"
                ? t`You need write access to add a folder in the Company data space.`
                : t`You need write access to add a website in the Company data space.`
              : category === "folder"
                ? t`Only members of the space can add a folder.`
                : t`Only members of the space can add a website.`
          }
          side="top"
          trigger={addToSpaceButton}
        />
      )}
    </>
  );
}
