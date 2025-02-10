import type {
  AgentActionPublicType,
  AgentMessagePublicType,
  LightWorkspaceType,
} from "@dust-tt/client";
import { Chip, Spinner } from "@dust-tt/sparkle";
import { classNames } from "@extension/lib/utils";
import { useEffect, useMemo, useState } from "react";
interface AgentMessageActionsProps {
  agentMessage: AgentMessagePublicType;
  owner: LightWorkspaceType;
}

const ACTION_RUNNING_LABELS: Record<AgentActionPublicType["type"], string> = {
  dust_app_run_action: "Running App",
  process_action: "Extracting data",
  retrieval_action: "Searching data",
  tables_query_action: "Querying tables",
  websearch_action: "Searching the web",
  browse_action: "Browsing page",
  conversation_list_files_action: "Listing files",
  conversation_include_file_action: "Including file ",
  github_get_pull_request_action: "Retrieving pull request",
  github_create_issue_action: "Creating issue",
  reasoning_action: "Reasoning",
};

export function AgentMessageActions({
  agentMessage,
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");

  // We're thinking or acting if the message status is still "created" and we don't have content
  // yet. Despite our work on chain of thoughts events, it's still possible for content to be
  // emitted before actions in which case we will think we're not thinking or acting until an action
  // gets emitted in which case the content will get requalified as chain of thoughts and this will
  // switch back to true.
  const isThinkingOrActing = useMemo(
    () => agentMessage.status === "created",
    [agentMessage.status]
  );

  useEffect(() => {
    if (isThinkingOrActing) {
      if (agentMessage.actions.length === 0) {
        setChipLabel("Thinking");
      } else {
        setChipLabel(renderActionName(agentMessage.actions));
      }
    } else {
      setChipLabel(undefined);
    }
  }, [isThinkingOrActing, agentMessage.actions]);

  return (
    <div className="flex flex-col items-start gap-y-4">
      <ActionDetails
        hasActions={agentMessage.actions.length !== 0}
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
      />
    </div>
  );
}

function ActionDetails({
  hasActions,
  label,
  isActionStepDone,
}: {
  hasActions: boolean;
  label?: string;
  isActionStepDone: boolean;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div key={label} className="animate-fadeIn duration-1000 fade-out">
      <Chip size="sm" color="slate" isBusy>
        <div
          className={classNames(
            "flex flex-row items-center gap-x-2",
            hasActions ? "cursor-pointer" : ""
          )}
        >
          <Spinner variant="dark" size="xs" />
          {label}
        </div>
      </Chip>
    </div>
  ) : (
    // TODO(Ext) Tools inspection
    false
    // <Button
    //   size={size === "normal" ? "sm" : "xs"}
    //   label="Tools inspection"
    //   icon={EyeIcon}
    //   variant="ghost"
    //   onClick={onClick}
    // />
  );
}

function renderActionName(actions: AgentActionPublicType[]): string {
  const uniqueActionTypes = actions.reduce(
    (acc, action) => {
      if (!acc.includes(action.type)) {
        acc.push(action.type);
      }

      return acc;
    },
    [] as AgentActionPublicType["type"][]
  );

  return uniqueActionTypes
    .map((actionType) => ACTION_RUNNING_LABELS[actionType])
    .join(", ");
}
