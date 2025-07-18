import { Box, Text } from "ink";
import type { FC } from "react";
import React from "react";

import type { Plan, Task } from "../../utils/planManager.js";

interface PlanDisplayProps {
  plan: Plan;
  compact?: boolean;
  showHeader?: boolean;
}

interface TaskItemProps {
  task: Task;
  isFirst?: boolean;
  compact?: boolean;
}

export const PlanDisplay: FC<PlanDisplayProps> = ({
  plan,
  compact = false,
}) => {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>⏺ Plan:</Text>
      </Box>
      <Box flexDirection="column">
        {plan.tasks.map((task, index) => (
          <TaskItem
            key={`task-${index}`}
            task={task}
            isFirst={index === 0}
            compact={compact}
          />
        ))}
      </Box>

      {plan.progress_percentage === 100 && (
        <Box marginTop={1}>
          <Box borderStyle="round" borderColor="green" padding={1}>
            <Text color="green" bold>
              Plan completed, all tasks are done.
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const TaskItem: FC<TaskItemProps> = ({ task, isFirst = false }) => {
  const status = task.done ? "☑" : "☐";
  const statusColor = task.done ? "green" : "gray";

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor}>
          {isFirst ? "  ⎿  " : "       "}
          {status}
        </Text>
        <Box marginLeft={1}>
          <Text>{task.task_name}</Text>
        </Box>
      </Box>

      {task.subtasks && task.subtasks.length > 0 && (
        <Box flexDirection="column">
          {task.subtasks.map((subtask, subIndex) => {
            const subStatus = subtask.done ? "☑" : "☐";
            const subStatusColor = subtask.done ? "green" : "gray";

            return (
              <Box key={`subtask-${subIndex}`}>
                <Text color={subStatusColor}>{subStatus}</Text>
                <Box marginLeft={1}>
                  <Text>{subtask.task_name}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
