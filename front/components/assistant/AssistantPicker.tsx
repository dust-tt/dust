import {
  Button,
  DropdownMenu,
  IconButton,
  Item,
  ListIcon,
  MoreIcon,
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

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
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
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  useEffect(() => {
    setSearchedAssistants(filterAndSortAgents(assistants, searchText));
  }, [searchText, assistants]);

  return (
    <DropdownMenu>
      {showDetails && (
        <AssistantDetails
          owner={owner}
          assistantId={showDetails.sId}
          show={showDetails !== null}
          onClose={() => {
            setShowDetails(null);
          }}
          flow="personal"
        />
      )}

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
        width={280}
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
            <Link
              href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`}
            >
              <Button
                label="Create"
                size="xs"
                variant="primary"
                icon={PlusIcon}
                className="mr-2"
              />
            </Link>
            <div className="s-flex-grow" />
            <Link href={`/w/${owner.sId}/assistant/assistants`}>
              <Button
                label="My Assistants"
                size="xs"
                variant="tertiary"
                icon={ListIcon}
              />
            </Link>
          </div>
        }
      >
        {searchedAssistants.map((c) => (
          <div
            key={`assistant-picker-container-${c.sId}`}
            className="flex flex-row items-center justify-between pr-2"
          >
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
            <IconButton
              icon={MoreIcon}
              onClick={() => {
                setShowDetails(c);
              }}
              variant="tertiary"
              size="sm"
            />
          </div>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
