import { filterAndSortAgents } from "@app/extension/app/src/lib/utils";
import { DropdownMenu, Item, RobotIcon, Searchbar } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

export function AssistantPicker({
  assistants,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState<
    LightAgentConfigurationType[]
  >([]);

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
              </div>
            ))}
          </DropdownMenu.Items>
        </>
      )}
    </DropdownMenu>
  );
}
