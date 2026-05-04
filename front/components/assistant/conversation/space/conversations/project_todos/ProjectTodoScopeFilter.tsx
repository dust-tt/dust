import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import {
  Avatar,
  Button,
  ChevronDownIcon,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  UserGroupIcon,
  UserIcon,
  WindIcon,
} from "@dust-tt/sparkle";

export function ProjectTodoScopeFilter() {
  const {
    showSuggestedTodosTable,
    assigneeSearch,
    setAssigneeSearch,
    isAssigneeMenuOpen,
    setIsAssigneeMenuOpen,
    filteredUsers,
    todoOwnerFilter,
    onTodoOwnerFilterChange,
    selectedUserSIds,
    viewerUserId,
    todoScopeLabel,
    isReadOnly,
    hasDoneItems,
    handleClean,
    isCleaning,
  } = useProjectTodosPanel();

  return (
    <div
      className={cn(
        "border-b border-border pb-6 dark:border-border-night",
        !showSuggestedTodosTable &&
          "border-t border-border pt-6 dark:border-border-night"
      )}
    >
      <div className="inline-flex w-full items-center gap-2">
        <DropdownMenu
          modal={false}
          open={isAssigneeMenuOpen}
          onOpenChange={(open) => {
            setIsAssigneeMenuOpen(open);
            if (open) {
              setAssigneeSearch("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-0 py-0.5 hover:bg-muted/40 dark:hover:bg-muted-night/40"
            >
              <h3 className="heading-2xl text-foreground dark:text-foreground-night">
                {todoScopeLabel}
              </h3>
              <Icon
                visual={ChevronDownIcon}
                size="sm"
                className="text-muted-foreground dark:text-muted-foreground-night"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
            align="start"
          >
            <DropdownMenuSearchbar
              autoFocus
              name="assignee-filter"
              placeholder="Search members"
              value={assigneeSearch}
              onChange={setAssigneeSearch}
            />
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              icon={UserIcon}
              label="Your to-dos"
              checked={todoOwnerFilter.assigneeScope === "mine"}
              onClick={() => {
                onTodoOwnerFilterChange({
                  assigneeScope: "mine",
                  selectedUserSIds: [],
                });
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuCheckboxItem
              icon={UserGroupIcon}
              label="Project's to-dos"
              checked={todoOwnerFilter.assigneeScope === "all"}
              onClick={() => {
                onTodoOwnerFilterChange({
                  assigneeScope: "all",
                  selectedUserSIds: [],
                });
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <DropdownMenuCheckboxItem
                    key={`todo-assignee-filter-${user.sId}`}
                    icon={() => (
                      <Avatar
                        size="xxs"
                        isRounded
                        visual={
                          user.image ?? "/static/humanavatar/anonymous.png"
                        }
                      />
                    )}
                    label={`${user.fullName}${viewerUserId === user.sId ? " (you)" : ""}`}
                    checked={
                      todoOwnerFilter.assigneeScope === "users" &&
                      selectedUserSIds.has(user.sId)
                    }
                    onClick={() => {
                      const next = new Set(selectedUserSIds);
                      if (next.has(user.sId)) {
                        next.delete(user.sId);
                      } else {
                        next.add(user.sId);
                      }
                      onTodoOwnerFilterChange({
                        assigneeScope: next.size === 0 ? "all" : "users",
                        selectedUserSIds: [...next],
                      });
                    }}
                    onSelect={(event) => {
                      event.preventDefault();
                    }}
                  />
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members found
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        {!isReadOnly && hasDoneItems && (
          <Button
            size="xs"
            variant="outline"
            icon={WindIcon}
            label="Clean"
            tooltip="Hide all done to-dos"
            onClick={handleClean}
            disabled={isCleaning}
          />
        )}
      </div>
    </div>
  );
}
