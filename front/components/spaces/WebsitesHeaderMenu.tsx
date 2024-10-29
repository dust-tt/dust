import { Button, Cog6ToothIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import SpaceWebsiteModal from "@app/components/spaces/SpaceWebsiteModal";
import { useDataSources } from "@app/lib/swr/data_sources";

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

  const { dataSources } = useDataSources(owner);

  return (
    <>
      <SpaceWebsiteModal
        isOpen={showEditWebsiteModal}
        onClose={() => {
          setShowEditWebsiteModal(false);
        }}
        owner={owner}
        space={space}
        dataSources={dataSources}
        dataSourceView={dataSourceView}
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
