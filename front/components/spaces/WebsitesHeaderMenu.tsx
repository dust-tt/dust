import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import SpaceWebsiteModal from "@app/components/spaces/websites/SpaceWebsiteModal";

type WebsitesHeaderMenuProps = {
  owner: WorkspaceType;
  space: SpaceType;
  canWriteInSpace: boolean;
  dataSourceView: DataSourceViewType;
};

export const WebsitesHeaderMenu = ({
  owner,
  space,
  canWriteInSpace,
  dataSourceView,
}: WebsitesHeaderMenuProps) => {
  const [showEditWebsiteModal, setShowEditWebsiteModal] = useState(false);

  return (
    <>
      <SpaceWebsiteModal
        isOpen={showEditWebsiteModal}
        onClose={() => {
          setShowEditWebsiteModal(false);
        }}
        owner={owner}
        space={space}
        dataSourceView={dataSourceView}
        canWriteInSpace={canWriteInSpace}
      />
      <Button
        size="sm"
        label="Edit Website"
        icon={Cog6ToothIcon}
        variant="primary"
        onClick={() => {
          setShowEditWebsiteModal(true);
        }}
        disabled={!canWriteInSpace}
      />
    </>
  );
};
