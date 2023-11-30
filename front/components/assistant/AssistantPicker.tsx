import {
  Button,
  DropdownMenu,
  Item,
  PlusIcon,
  RobotIcon,
  Searchbar,
  WrenchIcon,
} from "@dust-tt/sparkle";
import { AgentConfigurationType, WorkspaceType } from "@dust-tt/types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showBuilderButtons,
}: {
  owner: WorkspaceType;
  assistants: AgentConfigurationType[];
  onItemClick: (assistant: AgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showBuilderButtons?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState(assistants);

  useEffect(() => {
    setSearchedAssistants(filterAndSortAgents(assistants, searchText));
  }, [searchText, assistants]);

  return (
    <DropdownMenu>
      <div onClick={() => setSearchText("")}>
        {pickerButton ? (
          <DropdownMenu.Button>{pickerButton}</DropdownMenu.Button>
        ) : (
          <DropdownMenu.Button icon={RobotIcon} />
        )}
      </div>
      <DropdownMenu.Items origin="auto" width={240}>
        {assistants.length > 7 && (
          <div className="border-b border-structure-100 px-2 pb-2 pt-1">
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
        <div className="max-h-[22.5rem] overflow-y-auto [&>*]:w-full">
          {searchedAssistants.map((c) => (
            <Item.Avatar
              key={`assistant-picker-${c.sId}`}
              label={"@" + c.name}
              visual={c.pictureUrl}
              hasAction={false}
              className="px-3"
              onClick={() => {
                onItemClick(c);
                setSearchText("");
              }}
            />
          ))}
        </div>
        {(owner.role === "admin" || owner.role === "builder") &&
          showBuilderButtons && (
            <div className="flex flex-row justify-between border-t border-structure-100 px-3 pb-1 pt-2">
              <Link href={`/w/${owner.sId}/builder/assistants/new`}>
                <Button
                  label="Create"
                  size="xs"
                  variant="secondary"
                  icon={PlusIcon}
                />
              </Link>
              <Link href={`/w/${owner.sId}/builder/assistants`}>
                <Button
                  label="Manage"
                  size="xs"
                  variant="tertiary"
                  icon={WrenchIcon}
                />
              </Link>
            </div>
          )}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
