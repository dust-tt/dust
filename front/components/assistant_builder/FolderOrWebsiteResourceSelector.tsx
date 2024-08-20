import {
  FolderIcon,
  GlobeAltIcon,
  Page,
  Searchbar,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useState } from "react";

import FolderOrWebsiteTree from "@app/components/assistant_builder/FolderOrWebsiteTree";
import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/types";
import { subFilter } from "@app/lib/utils";

export default function FolderOrWebsiteResourceSelector({
  owner,
  type,
  dataSources,
  selectedNodes,
  onSelectChange,
}: {
  type: "folder" | "website";
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  selectedNodes: AssistantBuilderDataSourceConfiguration[];
  onSelectChange: (
    ds: DataSourceType,
    selected: boolean,
    resource?: ContentNode
  ) => void;
}) {
  const [query, setQuery] = useState<string>("");

  const filteredDataSources = dataSources.filter((ds) => {
    return subFilter(query.toLowerCase(), ds.name.toLowerCase());
  });

  return (
    <Transition show className="mx-auto max-w-6xl pb-8">
      <Page>
        <Page.Header
          title={type === "folder" ? "Select Folders" : "Select Websites"}
          icon={type === "folder" ? FolderIcon : GlobeAltIcon}
          description={`Select the ${
            type === "folder" ? "folders" : "websites"
          } that will be used by the assistant as a source for its answers.`}
        />
        <Searchbar
          name="search"
          onChange={setQuery}
          value={query}
          placeholder="Search..."
        />
        <div className="flex flex-row gap-32">
          <div className="flex-1">
            <div className="flex flex-row pb-4 text-lg font-semibold text-element-900">
              <div>Select from available folders:</div>
            </div>
          </div>
        </div>
        <div>
          <Tree>
            {filteredDataSources.map((dataSource) => {
              const currentConfig = selectedNodes.find(
                (selectedNode) => selectedNode.dataSource.id === dataSource.id
              );
              return (
                <FolderOrWebsiteTree
                  key={dataSource.id}
                  owner={owner}
                  dataSource={dataSource}
                  type={type}
                  currentConfig={currentConfig}
                  onSelectChange={onSelectChange}
                />
              );
            })}
          </Tree>
        </div>
      </Page>
    </Transition>
  );
}
