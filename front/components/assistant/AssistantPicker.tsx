import {
  Button,
  DropdownMenu,
  Item,
  ListIcon,
  PlusIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showBuilderButtons?: boolean;
  size?: "sm" | "md";
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState(assistants);

  useEffect(() => {
    setSearchedAssistants(filterAndSortAgents(assistants, searchText));
  }, [searchText, assistants]);

  return (
    <DropdownMenu>
      <div onClick={() => setSearchText("")} className="flex">
        {pickerButton ? (
          <DropdownMenu.Button size={size}>{pickerButton}</DropdownMenu.Button>
        ) : (
          <DropdownMenu.Button
            icon={RobotIcon}
            size={size}
            tooltip="Pick an assistant"
            tooltipPosition="above"
          />
        )}
      </div>
      <DropdownMenu.Items
        origin="auto"
        width={240}
        topBar={
          <>
            {assistants.length > 7 && (
              <div className="flex flex-grow flex-row border-b border-structure-50 p-2">
                <Searchbar
                  placeholder="Search"
                  name="input"
                  size="xs"
                  value={searchText}
                  onChange={setSearchText}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchedAssistants.length > 0) {
                      onItemClick(searchedAssistants[0]);
                      setSearchText("");
                    }
                  }}
                />
              </div>
            )}
          </>
        }
        bottomBar={
          <div className="flex border-t border-structure-50 p-2">
            <Link href={`/w/${owner.sId}/builder/assistants/new`}>
              <Button
                label="Create"
                size="xs"
                variant="primary"
                icon={PlusIcon}
              />
            </Link>
            <div className="s-flex-grow" />
            <Link href={`/w/${owner.sId}/assistant/assistants`}>
              <Button
                label="My Assistant"
                size="xs"
                variant="tertiary"
                icon={ListIcon}
              />
            </Link>
          </div>
        }
      >
        {searchedAssistants.map((c) => (
          <Item.Avatar
            key={`assistant-picker-${c.sId}`}
            label={"@" + c.name}
            visual={c.pictureUrl}
            hasAction={false}
            onClick={() => {
              onItemClick(c);
              setSearchText("");
            }}
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
