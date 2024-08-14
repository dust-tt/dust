import type { DataSourceType, PlanType, WorkspaceType } from "@dust-tt/types";

import { StandardDataSourceView } from "@app/components/data_source/StandardDataSourceView";

type VaultDataSourceContentListProps = {
  owner: WorkspaceType;
  hasWritePermission: boolean;
  dataSource: DataSourceType;
  plan: PlanType;
};

export const VaultDataSourceContentList = ({
  owner,
  hasWritePermission,
  dataSource,
  plan,
}: VaultDataSourceContentListProps) => {
  return (
    <StandardDataSourceView
      owner={owner}
      plan={plan}
      readOnly={!hasWritePermission}
      dataSource={dataSource}
    />
  );
};
