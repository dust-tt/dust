import { AddTodoComposer } from "@app/components/assistant/conversation/space/conversations/project_todos/AddTodoComposer";
import { ProjectTodosDataTable } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTable";
import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { normalizeProjectTodoSearchNeedle } from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { Spinner } from "@dust-tt/sparkle";

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
    handleAddTodo,
    isTodosLoading,
    frozenLastReadAt,
    groupedRegularTodosOnly,
    filteredTodos,
    assigneeScopedTodos,
    debouncedTodoSearchQuery,
    isSoleProjectMember,
    hideRegularTodoAssigneeHeaders,
  } = useProjectTodosPanel();

  const hasActiveLocalSearch =
    normalizeProjectTodoSearchNeedle(debouncedTodoSearchQuery) !== "";

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
        {/* Manual add: single row; expands on focus / menu / typed text */}
        {!isReadOnly &&
          (isSpaceInfoLoading ? (
            <div className="flex h-7 items-center">
              <Spinner size="sm" />
            </div>
          ) : projectMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              No project members available to assign.
            </p>
          ) : (
            <AddTodoComposer
              projectMembers={projectMembers}
              viewerUserId={viewerUserId}
              defaultAssigneeSId={defaultNewAssigneeSId!}
              hideAssigneePicker={isSoleProjectMember}
              onAdd={handleAddTodo}
            />
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
                hideAssigneeGroupHeaders={hideRegularTodoAssigneeHeaders}
                allowAssigneeReassign={!isSoleProjectMember}
              />
            )}

            {/* Empty state */}
            {filteredTodos.length === 0 && (
              <p className="text-base italic text-faint dark:text-faint-night">
                {hasActiveLocalSearch && assigneeScopedTodos.length > 0
                  ? "No to-dos match your filter."
                  : "You're all caught up!"}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
