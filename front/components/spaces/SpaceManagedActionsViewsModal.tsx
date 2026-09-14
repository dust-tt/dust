import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { filterMCPServerView } from "@app/lib/mcp";
import { useMCPServerViewsNotActivated } from "@app/lib/swr/mcp_servers";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Plus,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface SpaceManagedActionsViewsModelProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  onAddServerView: (serverView: MCPServerViewType) => void;
  shouldOpenMenu?: boolean;
  onOpenMenuHandled?: () => void;
}

export default function SpaceManagedActionsViewsModel({
  owner,
  space,
  onAddServerView,
  shouldOpenMenu,
  onOpenMenuHandled,
}: SpaceManagedActionsViewsModelProps) {
  const [searchText, setSearchText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { serverViews, isMCPServerViewsLoading } =
    useMCPServerViewsNotActivated({
      owner,
      space,
      disabled: !menuOpen,
    });

  useEffect(() => {
    if (!shouldOpenMenu) {
      return;
    }
    setMenuOpen(true);
    onOpenMenuHandled?.();
  }, [shouldOpenMenu, onOpenMenuHandled]);

  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button label="Add Tools" variant="primary" icon={Plus} size="sm" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[500px]"
        align="end"
        dropdownHeaders={
          <DropdownMenuSearchbar
            autoFocus
            className="flex-grow"
            placeholder="Search tools..."
            name="search"
            value={searchText}
            onChange={setSearchText}
            disabled={isMCPServerViewsLoading}
          />
        }
      >
        {isMCPServerViewsLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />{" "}
          </div>
        )}
        {!isMCPServerViewsLoading && serverViews.length <= 0 && (
          <DropdownMenuItem label="No more tools to add" disabled />
        )}
        {serverViews
          .filter((serverView) => filterMCPServerView(serverView, searchText))
          .map((serverView) => (
            <DropdownMenuItem
              key={serverView.sId}
              label={getMcpServerViewDisplayName(serverView)}
              icon={() => getAvatar(serverView.server, "xs")}
              description={getMcpServerViewDescription(serverView)}
              onClick={() => {
                onAddServerView(serverView);
              }}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
