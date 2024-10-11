import {
  Button,
  DropdownMenu,
  IconButton,
  Item,
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
  showFooterButtons = true,
  size = "md",
}: {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showFooterButtons?: boolean;
  size?: "sm" | "md";
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState<
    LightAgentConfigurationType[]
  >([]);
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  useEffect(() => {
    setSearchedAssistants(filterAndSortAgents(assistants, searchText));
  }, [searchText, assistants]);

  const searchbarRef = (element: HTMLInputElement) => {
    if (element) {
      // it turned out that the events are not properly propagated, leading
      // to a conflict with the InputBarContainer a hack around it is
      // adding a small timeout
      setTimeout(() => {
        element.focus();
      }, 200);
    }
  };

  return (
    // TODO(2024-10-09 jules): use Popover when new Button has been released
    <DropdownMenu>
      {({ close }) => (
        <>
          <AssistantDetails
            owner={owner}
            assistantId={showDetails?.sId || null}
            onClose={() => {
              setShowDetails(null);
            }}
          />

          <div onClick={() => setSearchText("")} className="flex">
            {pickerButton ? (
              <DropdownMenu.Button size={size}>
                {pickerButton}
              </DropdownMenu.Button>
            ) : (
              <DropdownMenu.Button
                icon={RobotIcon}
                size={size}
                onClick={() => {
                  setSearchText("");
                }}
                tooltip="Pick an assistant"
                tooltipPosition="top"
              />
            )}
          </div>
          <DropdownMenu.Items
            variant="no-padding"
            origin="auto"
            width={280}
            topBar={
              <>
                {assistants.length > 7 && (
                  <div className="flex flex-grow flex-row border-b border-structure-50 p-2">
                    <Searchbar
                      ref={searchbarRef}
                      placeholder="Search"
                      name="input"
                      size="xs"
                      value={searchText}
                      onChange={setSearchText}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          searchedAssistants.length > 0
                        ) {
                          onItemClick(searchedAssistants[0]);
                          setSearchText("");
                          close();
                        }
                      }}
                    />
                  </div>
                )}
              </>
            }
            bottomBar={
              showFooterButtons && (
                <div className="flex justify-end border-t border-structure-50 p-2">
                  <Link
                    href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
                  >
                    <Button
                      label="Create"
                      size="xs"
                      variant="primary"
                      icon={PlusIcon}
                      className="mr-2"
                    />
                  </Link>
                </div>
              )
            }
          >
            {searchedAssistants.map((c) => (
              <div
                key={`assistant-picker-container-${c.sId}`}
                className="flex flex-row items-center justify-between px-4"
              >
                <Item.Avatar
                  key={`assistant-picker-${c.sId}`}
                  label={c.name}
                  visual={c.pictureUrl}
                  hasAction={false}
                  onClick={() => {
                    onItemClick(c);
                    setSearchText("");
                  }}
                  className="truncate"
                />
                <IconButton
                  icon={MoreIcon}
                  onClick={() => {
                    close();
                    setShowDetails(c);
                  }}
                  variant="tertiary"
                  size="sm"
                />
              </div>
            ))}
          </DropdownMenu.Items>
        </>
      )}
    </DropdownMenu>
  );
}
