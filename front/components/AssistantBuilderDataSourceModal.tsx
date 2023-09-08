import { CloudArrowDownIcon, Modal, PageHeader } from "@dust-tt/sparkle";

import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { PermissionTree } from "./ConnectorPermissionsTree";

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
}) {
  console.log({ dataSources, owner });
  return (
    <Modal isOpen={isOpen} onClose={() => setOpen(false)} hasChanged={false}>
      <PageHeader
        title="Select a new data source"
        icon={CloudArrowDownIcon}
        description="What kind of data source do you want to add?"
      />
    </Modal>
  );
}
