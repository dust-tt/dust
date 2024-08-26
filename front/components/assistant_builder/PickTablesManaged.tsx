import { Page, ServerIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  WorkspaceType,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";

export const PickTablesManaged = ({
  owner,
  dataSourceView,
  onSelectionChange,
  selectedNodes,
  parentsById,
}: {
  owner: WorkspaceType;
  dataSourceView: DataSourceViewType;
  onSelectionChange: (
    dsView: DataSourceViewType,
    nodes: LightContentNode[],
    resource: LightContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  onBack?: () => void;
  selectedNodes: LightContentNode[];
  parentsById: Record<string, Set<string>> | undefined;
}) => {
  return (
    <Transition show className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table" icon={ServerIcon} />
        <DataSourceResourceSelectorTree
          owner={owner}
          dataSourceView={dataSourceView}
          showExpand={true}
          selectedResourceIds={
            selectedNodes
              ? [...new Set(selectedNodes.map((n) => n.internalId))]
              : []
          }
          selectedParents={[
            ...new Set(Object.values(parentsById || {}).flatMap((c) => [...c])),
          ]}
          filterPermission="read"
          viewType="tables"
          onSelectChange={(
            resource: LightContentNode,
            parents: string[],
            selected: boolean
          ) =>
            onSelectionChange(
              dataSourceView,
              selectedNodes,
              resource,
              parents,
              selected
            )
          }
        />
      </Page>
    </Transition>
  );
};
