import { usePublicAgentConfigurations } from "@app/extension/app/src/components/assistants/usePublicAgentConfigurations";
import type { InputBarContainerProps } from "@app/extension/app/src/components/input_bar/InputBarContainer";
import { InputBarContainer } from "@app/extension/app/src/components/input_bar/InputBarContainer";
import { InputBarContext } from "@app/extension/app/src/components/input_bar/InputBarContext";
import { classNames } from "@app/extension/app/src/lib/utils";
import type {
  AgentMention,
  LightWorkspaceType,
  MentionType,
} from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import { compareAgentsForSort } from "@dust-tt/types";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

// AGENT MENTION

function AgentMention({
  agentConfiguration,
}: {
  agentConfiguration: LightAgentConfigurationType;
}) {
  return (
    <div
      className={classNames("inline-block font-medium text-brand")}
      contentEditable={false}
      data-agent-configuration-id={agentConfiguration?.sId}
      data-agent-name={agentConfiguration?.name}
    >
      @{agentConfiguration.name}
    </div>
  );
}

/**
 *
 * @param additionalAgentConfiguration when trying an assistant in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of assistants)
 */
export function AssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  additionalAgentConfiguration,
  disableAutoFocus = false,
  isFloating = true,
  isFloatingWithoutMargin = false,
}: {
  owner: LightWorkspaceType;
  onSubmit: (input: string, mentions: MentionType[]) => void;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  disableAutoFocus?: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
}) {
  const { agentConfigurations: baseAgentConfigurations } =
    usePublicAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
    });

  const agentConfigurations = useMemo(() => {
    if (
      baseAgentConfigurations.find(
        (a) => a.sId === additionalAgentConfiguration?.sId
      ) ||
      !additionalAgentConfiguration
    ) {
      return baseAgentConfigurations;
    }
    return [...baseAgentConfigurations, additionalAgentConfiguration];
  }, [baseAgentConfigurations, additionalAgentConfiguration]);

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, selectedAssistant } = useContext(InputBarContext);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (animate && !isAnimating) {
      setIsAnimating(true);

      // Clear any existing timeout to ensure animations do not overlap.
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // Set timeout to set setIsAnimating to false after the duration.
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        // Reset the ref after the timeout clears.
        animationTimeoutRef.current = null;
      }, 700);
    }
  }, [animate, isAnimating]);

  // Cleanup timeout on component unmount.
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = (
    isEmpty,
    textAndMentions,
    resetEditorText
  ) => {
    if (isEmpty) {
      return;
    }

    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: MentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));

    onSubmit(text, mentions);
    resetEditorText();
  };

  return (
    <div className="flex w-full flex-col">
      <div
        className={classNames(
          "flex flex-1 px-0",
          isFloating ? (isFloatingWithoutMargin ? "" : "sm:px-4") : ""
        )}
      >
        <div className="flex w-full flex-1 flex-col items-end self-stretch sm:flex-row">
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-4 sm:flex-row",
              "border-struture-200 border-t bg-white/90 backdrop-blur focus-within:border-structure-300",
              "transition-all",
              isFloating
                ? "sm:rounded-2xl sm:border-b sm:border-l sm:border-r sm:border-element-500 sm:focus-within:border-action-300 sm:focus-within:shadow-md sm:focus-within:ring-1"
                : "",
              isAnimating ? "duration-600 animate-shake" : "duration-300"
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              <InputBarContainer
                disableAutoFocus={disableAutoFocus}
                allAssistants={activeAgents}
                agentConfigurations={agentConfigurations}
                owner={owner}
                selectedAssistant={selectedAssistant}
                onEnterKeyDown={handleSubmit}
                stickyMentions={stickyMentions}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
