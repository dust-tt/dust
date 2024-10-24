import {
  Button,
  IconButton,
  Item,
  MoreIcon,
  PlusIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  RobotIcon,
  ScrollArea,
  Searchbar,
  Separator,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { filterAndSortAgents } from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";

const ShowAssistantDetailsButton = ({
  assistant,
}: {
  assistant: LightAgentConfigurationType;
}) => {
  const router = useRouter();

  const showAssistantDetails = useCallback(
    (agentConfiguration: LightAgentConfigurationType) => {
      setQueryParam(router, "assistantDetails", agentConfiguration.sId);
    },
    [router]
  );
  return (
    <IconButton
      icon={MoreIcon}
      onClick={() => {
        close();
        showAssistantDetails(assistant);
      }}
      variant="ghost"
      size="sm"
    />
  );
};

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showMoreDetailsButtons = true,
  showFooterButtons = true,
  size = "md",
}: {
  owner: WorkspaceType;
  assistants: LightAgentConfigurationType[];
  onItemClick: (assistant: LightAgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showMoreDetailsButtons?: boolean;
  showFooterButtons?: boolean;
  size?: "xs" | "sm" | "md";
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
      element.focus();
    }
  };

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <>
          {pickerButton ? (
            pickerButton
          ) : (
            <Button
              icon={RobotIcon}
              variant="ghost"
              isSelect
              size={size}
              tooltip="Pick an assistant"
            />
          )}
        </>
      </PopoverTrigger>
      <PopoverContent className="mr-2 p-2">
        <Searchbar
          ref={searchbarRef}
          placeholder="Search"
          name="input"
          size="xs"
          value={searchText}
          onChange={setSearchText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchedAssistants.length > 0) {
              onItemClick(searchedAssistants[0]);
              setSearchText("");
              close();
            }
          }}
        />
        <ScrollArea className="mt-2 h-[300px]">
          {searchedAssistants.map((c) => (
            <div
              key={`assistant-picker-container-${c.sId}`}
              className="flex flex-row items-center justify-between px-2"
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
              {showMoreDetailsButtons && (
                <ShowAssistantDetailsButton assistant={c} />
              )}
            </div>
          ))}
        </ScrollArea>
        {showFooterButtons && (
          <>
            <Separator />
            <div className="mt-2 flex justify-end">
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
          </>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
