import { EditableTaskItem } from "@app/components/pod/tasks/EditableTaskItem";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { SuggestedTaskItem } from "@app/components/pod/tasks/SuggestedTaskItem";
import {
  POD_TASK_NO_ASSIGNEE_LABEL,
  type PodTaskAssigneeType,
  type PodTaskType,
} from "@app/types/project_task";
import { Avatar, Button, Card, Icon, SparklesIcon } from "@dust-tt/sparkle";
import { useState } from "react";

interface PodTaskUserSectionProps {
  user: PodTaskAssigneeType | null;
  suggestedTasks: PodTaskType[];
  regularTasks: PodTaskType[];
  showHeader: boolean;
}

export function PodTaskUserSection({
  user,
  suggestedTasks,
  regularTasks,
  showHeader,
}: PodTaskUserSectionProps) {
  const {
    viewerUserId,
    owner,
    agentNameById,
    newItemKeys,
    isReadOnly,
    onApproveAgentSuggestion,
    onApproveAllSuggestedForAssignee,
    onRejectAllSuggestedForAssignee,
  } = usePodTasksPanel();

  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(
    null
  );

  const isYou = viewerUserId !== null && user?.sId === viewerUserId;
  const displayName =
    user === null ? POD_TASK_NO_ASSIGNEE_LABEL : user.fullName;
  const showBulkActions =
    suggestedTasks.length > 0 && viewerUserId !== null && !isReadOnly;

  const runBulk = async (kind: "approve" | "reject") => {
    setBulkAction(kind);
    try {
      const ids = suggestedTasks.map((t) => t.sId);
      if (kind === "approve") {
        await onApproveAllSuggestedForAssignee(ids);
      } else {
        await onRejectAllSuggestedForAssignee(ids);
      }
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex items-center gap-3">
          {!!user ? (
            <Avatar
              name={displayName}
              visual={user.image}
              size="xs"
              isRounded
            />
          ) : (
            <Avatar size="xs" isRounded />
          )}
          <div className="flex flex-1 flex-col">
            <h4 className="heading-base text-muted-foreground dark:text-foreground-night">
              {displayName}
              {user !== null && isYou ? " (you)" : ""}
            </h4>
          </div>
        </div>
      )}
      {suggestedTasks.length > 0 && (
        <Card variant="primary" size="md">
          <div className="flex w-full flex-col gap-4">
            <div className="heading-sm flex items-center gap-2 text-muted-foreground dark:text-muted-foreground-night">
              <Icon visual={SparklesIcon} size="sm" />
              Suggestions
            </div>
            <div className="flex w-full flex-col">
              {suggestedTasks.map((task) => (
                <SuggestedTaskItem
                  key={task.sId}
                  task={task}
                  viewerUserId={viewerUserId}
                  onApproveAgentSuggestion={onApproveAgentSuggestion}
                  owner={owner}
                  agentNameById={agentNameById}
                  isNew={newItemKeys.has(task.sId)}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
            {showBulkActions && (
              <div className="flex items-center justify-start gap-2">
                <Button
                  label="Dismiss all"
                  size="sm"
                  variant="outline"
                  isLoading={bulkAction === "reject"}
                  disabled={bulkAction !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runBulk("reject");
                  }}
                />
                <Button
                  label="Accept all"
                  size="sm"
                  variant="highlight-secondary"
                  isLoading={bulkAction === "approve"}
                  disabled={bulkAction !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runBulk("approve");
                  }}
                />
              </div>
            )}
          </div>
        </Card>
      )}
      {regularTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          {regularTasks.map((task) => (
            <EditableTaskItem key={task.sId} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
