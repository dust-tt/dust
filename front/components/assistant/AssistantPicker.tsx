import { AgentConfigurationType } from "@app/types/assistant/agent";
import { WorkspaceType } from "@app/types/user";
import {
  DropdownMenu,
  RobotIcon,
  MagnifyingGlassStrokeIcon,
  Button,
  PlusIcon,
  WrenchIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useState } from "react";

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  manageButtons,
}: {
  owner: WorkspaceType;
  assistants: AgentConfigurationType[];
  onItemClick: (assistant: AgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  manageButtons?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const searchedAssistants = assistants.filter((a) =>
    a.name.toLowerCase().startsWith(searchText.toLowerCase())
  );
  return (
    <DropdownMenu>
      {pickerButton ? (
        <DropdownMenu.Button>{pickerButton}</DropdownMenu.Button>
      ) : (
        <DropdownMenu.Button icon={RobotIcon} />
      )}
      <DropdownMenu.Items origin="auto" width={240}>
        {assistants.length > 7 && (
          <div className="border-b border-structure-100 p-2">
            <div className="relative text-sm font-medium text-element-800">
              <input
                type="text"
                placeholder="Search"
                value={searchText}
                className="h-9 w-full rounded-full border-structure-200 pr-8"
                onKeyUp={(e) => {
                  if (e.key === "Enter" && searchedAssistants.length > 0) {
                    onItemClick(searchedAssistants[0]);
                    setSearchText("");
                  }
                }}
                onChange={(e) => {
                  setSearchText(e.target.value);
                }}
                autoFocus={true}
              />
              <MagnifyingGlassStrokeIcon className="absolute right-3 top-2 h-5 w-5" />
            </div>
          </div>
        )}
        <div className="max-h-[22.5rem] overflow-y-auto [&>*]:w-full">
          {searchedAssistants.map((c) => (
            <DropdownMenu.Item
              key={`assistant-picker-${c.sId}`}
              label={"@" + c.name}
              visual={c.pictureUrl}
              onClick={() => {
                onItemClick(c);
                setSearchText("");
              }}
            />
          ))}
        </div>
        {(owner.role === "admin" || owner.role === "builder") &&
          manageButtons && (
            <div className="flex flex-row justify-between border-t border-structure-100 px-3 py-2">
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
