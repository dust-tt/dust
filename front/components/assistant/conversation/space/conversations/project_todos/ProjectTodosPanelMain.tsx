import { ProjectTodosDataTable } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTable";
import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { AddTodoComposer } from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import { ADD_TODO_BAR_SHELL_CLASS } from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { cn, Icon, PlusIcon, Spinner } from "@dust-tt/sparkle";

export function ProjectTodosPanelMain() {
  const {
    showSuggestedTodosTable,
    groupedSuggestedTodosOnly,
    viewerUserId,
    owner,
    activeAgents,
    isAgentsLoading,
    agentNameById,
    pendingRemovalIds,
    newItemKeys,
    doneFlashKeys,
    startingTodoIds,
    isReadOnly,
    firstOnboardingTodoId,
    projectMembers,
    membersWithActiveTodoIds,
    handleToggleDone,
    requestDelete,
    onApproveAgentSuggestion,
    onRejectAgentSuggestion,
    onApproveAllSuggestedForAssignee,
    onRejectAllSuggestedForAssignee,
    handleStartWorking,
    patchTodoItem,
    isSpaceInfoLoading,
    defaultNewAssigneeSId,
    isAddTodoComposerOpen,
    setIsAddTodoComposerOpen,
    handleAddTodo,
    isTodosLoading,
    frozenLastReadAt,
    groupedRegularTodosOnly,
    filteredTodos,
  } = useProjectTodosPanel();

  return (
    <>
      {showSuggestedTodosTable && (
        <div className="mb-4">
          <ProjectTodosDataTable
            variant="suggested"
            groupedTodosForAll={groupedSuggestedTodosOnly}
            viewerUserId={viewerUserId}
            owner={owner}
            activeAgents={activeAgents}
            agentsLoading={isAgentsLoading}
            agentNameById={agentNameById}
            pendingRemovalIds={pendingRemovalIds}
            newItemKeys={newItemKeys}
            doneFlashKeys={doneFlashKeys}
            startingTodoIds={startingTodoIds}
            isReadOnly={isReadOnly}
            firstOnboardingTodoId={firstOnboardingTodoId}
            projectMembers={projectMembers}
            membersWithActiveTodoIds={membersWithActiveTodoIds}
            onToggleDone={handleToggleDone}
            onDelete={requestDelete}
            onApproveAgentSuggestion={onApproveAgentSuggestion}
            onRejectAgentSuggestion={onRejectAgentSuggestion}
            onApproveAllSuggestedForAssignee={onApproveAllSuggestedForAssignee}
            onRejectAllSuggestedForAssignee={onRejectAllSuggestedForAssignee}
            onStartWorking={handleStartWorking}
            onPatchTodo={patchTodoItem}
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {/* Manual add: discreet until opened; one row when expanded */}
        {!isReadOnly &&
          (isSpaceInfoLoading ? (
            <div className="flex h-7 items-center">
              <Spinner size="sm" />
            </div>
          ) : projectMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              No project members available to assign.
            </p>
          ) : isAddTodoComposerOpen ? (
            <AddTodoComposer
              projectMembers={projectMembers}
              viewerUserId={viewerUserId}
              defaultAssigneeSId={defaultNewAssigneeSId!}
              onAdd={handleAddTodo}
              onClose={() => setIsAddTodoComposerOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsAddTodoComposerOpen(true)}
              className={cn(
                ADD_TODO_BAR_SHELL_CLASS,
                "cursor-pointer text-left text-muted-foreground transition-colors",
                "hover:bg-muted-background/80 dark:text-muted-foreground-night dark:hover:bg-muted-background-night/70"
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center">
                <Icon visual={PlusIcon} size="xs" className="opacity-80" />
              </span>
              <span className="min-w-0 flex-1 text-base leading-6">
                Add a to-do
              </span>
              <span className="size-7 shrink-0" aria-hidden />
            </button>
          ))}

        {/* Body */}
        {isTodosLoading || frozenLastReadAt === undefined ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            {groupedRegularTodosOnly.length > 0 && (
              <ProjectTodosDataTable
                variant="regular"
                groupedTodosForAll={groupedRegularTodosOnly}
                viewerUserId={viewerUserId}
                owner={owner}
                activeAgents={activeAgents}
                agentsLoading={isAgentsLoading}
                agentNameById={agentNameById}
                pendingRemovalIds={pendingRemovalIds}
                newItemKeys={newItemKeys}
                doneFlashKeys={doneFlashKeys}
                startingTodoIds={startingTodoIds}
                isReadOnly={isReadOnly}
                firstOnboardingTodoId={firstOnboardingTodoId}
                projectMembers={projectMembers}
                membersWithActiveTodoIds={membersWithActiveTodoIds}
                onToggleDone={handleToggleDone}
                onDelete={requestDelete}
                onApproveAgentSuggestion={onApproveAgentSuggestion}
                onRejectAgentSuggestion={onRejectAgentSuggestion}
                onStartWorking={handleStartWorking}
                onPatchTodo={patchTodoItem}
              />
            )}

            {/* Empty state */}
            {filteredTodos.length === 0 && (
              <p className="text-base italic text-faint dark:text-faint-night">
                You're all caught up!
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
