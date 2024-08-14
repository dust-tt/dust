import { Page, ServerIcon } from "@dust-tt/sparkle";
import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";

export const PickTablesManaged = ({
  owner,
  dataSource,
  onSelectionChange,
  selectedNodes,
  parentsById,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  onSelectionChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  onBack?: () => void;
  selectedNodes: ContentNode[];
  parentsById: Record<string, Set<string>>;
}) => {
  return (
    <Transition show={true} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table" icon={ServerIcon} />
        <DataSourceResourceSelectorTree
          owner={owner}
          dataSource={dataSource}
          showExpand={true}
          selectedResourceIds={
            selectedNodes
              ? [...new Set(selectedNodes.map((n) => n.internalId))]
              : []
          }
          selectedParents={[
            ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
          ]}
          filterPermission="read"
          viewType={"tables"}
          onSelectChange={onSelectionChange}
        />
      </Page>
    </Transition>
  );
};
