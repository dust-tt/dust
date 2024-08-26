import {
  FolderIcon,
  GlobeAltIcon,
  Page,
  Searchbar,
  Tree,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  WorkspaceType,
} from "@dust-tt/types";
import { isFolder, isWebsite } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useContext, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import FolderOrWebsiteTree from "@app/components/assistant_builder/FolderOrWebsiteTree";
import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/types";
import { subFilter } from "@app/lib/utils";

export default function FolderOrWebsiteResourceSelector({
  owner,
  type,
  selectedNodes,
  onSelectChange,
}: {
  type: "folder" | "website";
  owner: WorkspaceType;
  selectedNodes: AssistantBuilderDataSourceConfiguration[];
  onSelectChange: (
    dsView: DataSourceViewType,
    selected: boolean,
    resource?: LightContentNode
  ) => void;
}) {
  const [query, setQuery] = useState<string>("");
  const { dataSourceViews } = useContext(AssistantBuilderContext);

  const filteredDsViews = dataSourceViews
    .filter((dsView) =>
      type === "folder"
        ? isFolder(dsView.dataSource)
        : isWebsite(dsView.dataSource)
    )
    .filter((ds) => {
      return subFilter(query.toLowerCase(), ds.dataSource.name.toLowerCase());
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
              <div>
                Select from available{" "}
                {type === "folder" ? "folders" : "websites"}:
              </div>
            </div>
          </div>
        </div>
        <div>
          <Tree>
            {filteredDsViews.map((dsView) => {
              const currentConfig = selectedNodes.find(
                (selectedNode) => selectedNode.dataSourceView.id === dsView.id
              );
              return (
                <FolderOrWebsiteTree
                  key={dsView.id}
                  owner={owner}
                  dataSourceView={dsView}
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
