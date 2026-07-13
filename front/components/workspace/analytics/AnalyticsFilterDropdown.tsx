import { USER_MESSAGE_ORIGIN_LABELS } from "@app/components/agent_builder/observability/constants";
import type {
  AnalyticsEntityFilter,
  AnalyticsFilter,
  AnalyticsScopeDimension,
} from "@app/components/workspace/analytics/analyticsFilter";
import {
  SCOPE_DIMENSION_LABEL,
  toggleScopeEntity,
} from "@app/components/workspace/analytics/analyticsFilter";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useKeys } from "@app/lib/swr/apps";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { DropdownMenuFilterOption } from "@dust-tt/sparkle";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuFilters,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterFunnel01,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

const DIMENSION_FILTERS: DropdownMenuFilterOption<AnalyticsScopeDimension>[] = (
  ["user", "agent", "origin", "api_key"] as const
).map((dimension) => ({
  value: dimension,
  label: SCOPE_DIMENSION_LABEL[dimension],
}));

const MEMBERS_PAGE_SIZE = 25;

interface AnalyticsFilterDropdownProps {
  filter: AnalyticsFilter;
  onFilterChange: (next: AnalyticsFilter) => void;
}

export function AnalyticsFilterDropdown({
  filter,
  onFilterChange,
}: AnalyticsFilterDropdownProps) {
  const owner = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [dimension, setDimension] = useState<AnalyticsScopeDimension>("user");
  const [searchText, setSearchText] = useState("");

  const { members, isLoading: isMembersLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: MEMBERS_PAGE_SIZE,
    disabled: !isOpen || dimension !== "user",
  });

  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: isOpen && dimension === "agent" ? "manage" : null,
      sort: "alphabetical",
    });

  const { keys, isKeysLoading } = useKeys(owner, {
    disabled: !isOpen || dimension !== "api_key",
  });

  const entities: AnalyticsEntityFilter[] = useMemo(() => {
    const search = searchText.toLowerCase();
    const matches = (name: string) => name.toLowerCase().includes(search);
    switch (dimension) {
      case "user":
        // Search is applied server-side by useSearchMembers.
        return members.map((member) => ({
          id: member.sId,
          name: member.fullName,
        }));
      case "agent":
        return agentConfigurations
          .filter((agent) => matches(agent.name))
          .map((agent) => ({ id: agent.sId, name: agent.name }));
      case "origin":
        return Object.entries(USER_MESSAGE_ORIGIN_LABELS)
          .map(([origin, { label }]) => ({ id: origin, name: label }))
          .filter((entity) => matches(entity.name));
      case "api_key":
        // The analytics filter matches API keys by display name.
        return keys
          .filter((key) => matches(key.name))
          .map((key) => ({ id: key.name, name: key.name }));
      default:
        assertNeverAndIgnore(dimension);
        return [];
    }
  }, [dimension, searchText, members, agentConfigurations, keys]);

  const selectedIds = useMemo(
    () => new Set((filter[dimension] ?? []).map((entity) => entity.id)),
    [filter, dimension]
  );

  const isLoading =
    (dimension === "user" && isMembersLoading) ||
    (dimension === "agent" && isAgentConfigurationsLoading) ||
    (dimension === "api_key" && isKeysLoading);

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={FilterFunnel01}
          size="xs"
          variant="outline"
          tooltip="Add filter"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[320px]"
        align="end"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              value={searchText}
              onChange={setSearchText}
              name="search"
              placeholder="Search"
              autoFocus
            />
            <DropdownMenuFilters
              filters={DIMENSION_FILTERS}
              selectedValues={[dimension]}
              onSelectFilter={setDimension}
            />
          </>
        }
      >
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : entities.length > 0 ? (
          entities.map((entity) => (
            <DropdownMenuCheckboxItem
              key={entity.id}
              label={entity.name}
              truncateText
              checked={selectedIds.has(entity.id)}
              onCheckedChange={() =>
                onFilterChange(toggleScopeEntity(filter, dimension, entity))
              }
              // Keep the menu open so several values can be toggled in a row.
              onSelect={(event) => event.preventDefault()}
            />
          ))
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No results
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
