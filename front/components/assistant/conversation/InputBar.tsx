import {
  ArrowUpIcon,
  AttachmentIcon,
  Avatar,
  Button,
  Citation,
  FullscreenExitIcon,
  FullscreenIcon,
  IconButton,
  StopIcon,
} from "@dust-tt/sparkle";
import { WorkspaceType } from "@dust-tt/types";
import { AgentConfigurationType } from "@dust-tt/types";
import { AgentMention, MentionType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import {
  createContext,
  ForwardedRef,
  forwardRef,
  Fragment,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as ReactDOMServer from "react-dom/server";
import { mutate } from "swr";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useAgentConfigurations } from "@app/lib/swr";
import { classNames, filterAndSortAgents } from "@app/lib/utils";

import Tiptap from "./InputBarTipTap";

// AGENT MENTION

function AgentMention({
  agentConfiguration,
}: {
  agentConfiguration: AgentConfigurationType;
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

// AGENT LIST

function AgentListImpl(
  {
    owner,
    visible,
    filter,
    position,
    conversationId,
  }: {
    owner: WorkspaceType;
    visible: boolean;
    filter: string;
    position: {
      bottom: number;
      left: number;
    };
    conversationId: string | null;
  },
  ref: ForwardedRef<{
    prev: () => void;
    next: () => void;
    reset: () => void;
    selected: () => AgentConfigurationType | null;
    noMatch: () => boolean;
    perfectMatch: () => boolean;
  }>
) {
  const [focus, setFocus] = useState<number>(0);

  const focusRef = useRef<HTMLDivElement>(null);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const filtered = filterAndSortAgents(activeAgents, filter);

  useImperativeHandle(ref, () => ({
    prev: () => {
      setFocus((f) => (f > 0 ? f - 1 : 0));
    },
    next: () => {
      setFocus((f) => (f < filtered.length - 1 ? f + 1 : filtered.length - 1));
    },
    reset: () => {
      setFocus(0);
    },
    selected: () => {
      if (focus < filtered.length) {
        return filtered[focus];
      }
      return null;
    },
    noMatch: () => {
      return filtered.length === 0;
    },
    perfectMatch: () => {
      return !!filtered.find(
        (a) => a.name.toLowerCase() === filter.toLowerCase()
      );
    },
  }));

  useEffect(() => {
    if (focus > filtered.length - 1) {
      if (filtered.length === 0) {
        setFocus(0);
      } else {
        setFocus(filtered.length - 1);
      }
    }
    if (focusRef.current) {
      focusRef.current.scrollIntoView({
        // behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [focus, visible, filter, filtered]);

  return (
    <Transition
      show={visible}
      as={Fragment}
      enter="transition ease-out duration-200"
      enterFrom="transform opacity-0 scale-95 translate-y-5"
      enterTo="transform opacity-100 scale-100 translate-y-0"
      leave="transition ease-in duration-0"
      leaveFrom="transform opacity-100 scale-100 translate-y-0"
      leaveTo="transform opacity-0 scale-100 translate-y-0"
    >
      <div
        className="fixed z-10 max-h-64 w-[240px] overflow-y-auto rounded-xl border border-structure-100 bg-white shadow-xl"
        style={{
          bottom: position.bottom,
          left: position.left,
        }}
      >
        <div className="flex flex-col gap-y-1 px-3 py-2">
          {filtered.map((c, i) => (
            <div
              className="flex w-full px-1"
              key={c.name}
              ref={focus === i ? focusRef : null}
            >
              <div
                className="flex w-full cursor-pointer flex-col"
                onMouseEnter={() => {
                  setFocus(i);
                }}
              >
                <div className="flex flex-initial items-center gap-x-2 py-1">
                  <Avatar size="xs" visual={c.pictureUrl} />
                  <div
                    className={classNames(
                      "flex-initial text-sm font-semibold",
                      focus === i ? "text-action-500" : "text-element-900"
                    )}
                  >
                    {"@"}
                    {c.name}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Transition>
  );
}

const AgentList = forwardRef(AgentListImpl);

import { useCurrentEditor } from "@tiptap/react";

function moveCursorToEnd(el: HTMLElement) {
  const range = document.createRange();
  const sel = window.getSelection();
  if (sel) {
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function getAgentMentionNode(
  agentConfiguration: AgentConfigurationType
): ChildNode | null {
  const htmlString = ReactDOMServer.renderToStaticMarkup(
    <AgentMention agentConfiguration={agentConfiguration} />
  );
  const wrapper = document.createElement("div");
  wrapper.innerHTML = htmlString.trim();
  return wrapper.firstChild;
}

export function AssistantInputBar({
  owner,
  onSubmit,
  conversationId,
  stickyMentions,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: { title: string; content: string }
  ) => void;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
}) {
  const [agentListVisible, setAgentListVisible] = useState(false);
  const [agentListFilter, setAgentListFilter] = useState("");
  const [agentListPosition, setAgentListPosition] = useState<{
    bottom: number;
    left: number;
  }>({
    bottom: 0,
    left: 0,
  });
  const [contentFragmentBody, setContentFragmentBody] = useState<
    string | undefined
  >(undefined);
  const [contentFragmentFilename, setContentFragmentFilename] = useState<
    string | undefined
  >(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const agentListRef = useRef<{
    prev: () => void;
    next: () => void;
    reset: () => void;
    selected: () => AgentConfigurationType | null;
    noMatch: () => boolean;
    perfectMatch: () => boolean;
  }>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Empty bar detection logic
  const [empty, setEmpty] = useState<boolean>(
    !inputRef.current?.textContent ||
      inputRef.current.textContent.replace(/[\u200B\n]/g, "").length === 0
  );
  // MutationObserver is only defined after window is defined so observer cannot
  // be defined in the useRef below
  const observer = useRef<MutationObserver | null>(null);
  useEffect(() => {
    if (!observer.current && inputRef.current) {
      observer.current = new MutationObserver(function () {
        setEmpty(
          !inputRef.current?.textContent ||
            inputRef.current.textContent.replace(/[\u200B\n]/g, "").length === 0
        );
      });
      observer.current.observe(inputRef.current, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }, []);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });
  const sendNotification = useContext(SendNotificationsContext);

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const [isExpanded, setIsExpanded] = useState(false);

  const { editor } = useCurrentEditor();

  const handleSubmit = async () => {
    // if (empty) {
    //   return;
    // }

    console.log(">> result:", JSON.stringify(editor?.getJSON(), null, 2));

    const contentEditable = document.getElementsByClassName("dust-input-bar");
    console.log("> contentEditable:", contentEditable);
    if (contentEditable) {
      const mentions: MentionType[] = [];
      let content = "";

      // Array.from(contentEditable.childNodes).forEach((node) => {
      //   if (node.nodeType === Node.ELEMENT_NODE) {
      //     // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
      //     const agentConfigurationId = node.getAttribute(
      //       "data-agent-configuration-id"
      //     );
      //     // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
      //     const agentName = node.getAttribute("data-agent-name");

      //     if (agentConfigurationId && agentName) {
      //       mentions.push({
      //         configurationId: agentConfigurationId,
      //       });
      //       // Internal format for mentions is `:mention[agentName]{sId=agentConfigurationId}`.
      //       content += `:mention[${agentName}]{sId=${agentConfigurationId}}`;
      //     }
      //   }
      //   if (node.nodeType === Node.TEXT_NODE) {
      //     content += node.textContent;
      //   }
      // });

      // content += `:mention[${agentName}]{sId=${agentConfigurationId}}`;

      content = content.trim();
      content = content.replace(/\u200B/g, "");
      let contentFragment:
        | {
            title: string;
            content: string;
            url: string | null;
            contentType: string;
          }
        | undefined = undefined;
      if (contentFragmentBody && contentFragmentFilename) {
        contentFragment = {
          title: contentFragmentFilename,
          content: contentFragmentBody,
          url: null,
          contentType: "file_attachment",
        };
      }
      setIsExpanded(false);
      onSubmit(content, mentions, contentFragment);
      // contentEditable.innerHTML = "";
      setContentFragmentFilename(undefined);
      setContentFragmentBody(undefined);
    }
  };

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, selectedAssistant } = useContext(InputBarContext);

  useEffect(() => {
    if (animate && !isAnimating) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1500);
    }
  }, [animate, isAnimating]);

  const stickyMentionsTextContent = useRef<string | null>(null);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "FixedAssistantInputBar must be used within a GenerationContextProvider"
    );
  }

  const handleStopGeneration = async () => {
    if (!conversationId) {
      return;
    }
    setIsProcessing(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          messageIds: generationContext.generatingMessageIds,
        }),
      }
    );
    await mutate(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}`
    );
  };

  useEffect(() => {
    if (isProcessing && generationContext.generatingMessageIds.length === 0) {
      setIsProcessing(false);
    }
  }, [isProcessing, generationContext.generatingMessageIds.length]);

  useEffect(() => {
    if (!stickyMentions?.length && !selectedAssistant) {
      return;
    }

    const mentionsToInject = stickyMentions?.length
      ? stickyMentions
      : ([selectedAssistant] as [AgentMention]);

    const mentionedAgentConfigurationIds = new Set(
      mentionsToInject?.map((m) => m.configurationId)
    );

    const contentEditable = document.getElementById("dust-input-bar");
    if (contentEditable) {
      const textContent = contentEditable.textContent?.trim();

      if (textContent?.length && !stickyMentionsTextContent.current) {
        return;
      }

      if (
        textContent?.length &&
        textContent !== stickyMentionsTextContent.current
      ) {
        // content has changed, we don't clear it (we preserve whatever the user typed)
        return;
      }

      // we clear the content of the input bar -- at this point, it's either already empty,
      // or contains only the sticky mentions added by this hook
      contentEditable.innerHTML = "";
      let lastTextNode = null;
      for (const configurationId of mentionedAgentConfigurationIds) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (!agentConfiguration) {
          continue;
        }
        const mentionNode = getAgentMentionNode(agentConfiguration);
        if (!mentionNode) {
          continue;
        }
        contentEditable.appendChild(mentionNode);
        lastTextNode = document.createTextNode(" ");
        contentEditable.appendChild(lastTextNode);

        stickyMentionsTextContent.current =
          contentEditable.textContent?.trim() || null;
      }
      // move the cursor to the end of the input bar
      if (lastTextNode) {
        moveCursorToEnd(contentEditable);
      }
    }
  }, [
    stickyMentions,
    agentConfigurations,
    stickyMentionsTextContent,
    selectedAssistant,
  ]);

  return (
    <>
      {/* <AgentList
        owner={owner}
        visible={agentListVisible}
        filter={agentListFilter}
        ref={agentListRef}
        position={agentListPosition}
        conversationId={conversationId}
      /> */}

      {generationContext.generatingMessageIds.length > 0 && (
        <div className="flex justify-center px-4 pb-4">
          <Button
            className="mt-4"
            variant="tertiary"
            label={isProcessing ? "Stopping generation..." : "Stop generation"}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isProcessing}
          />
        </div>
      )}

      <div className="flex flex-1 px-0 sm:px-4">
        <div className="flex flex-1 flex-col items-end self-stretch sm:flex-row">
          <div
            className={classNames(
              "relative flex flex-1 flex-col items-stretch gap-0 self-stretch pl-4 sm:flex-row",
              "border-struture-200 border-t bg-white/80 shadow-[0_0_36px_-15px_rgba(0,0,0,0.3)] backdrop-blur focus-within:border-structure-300 sm:rounded-3xl sm:border-2 sm:border-element-500 sm:shadow-[0_12px_36px_-15px_rgba(0,0,0,0.3)] sm:focus-within:border-element-600",
              "transition-all duration-300",
              isAnimating
                ? "animate-shake border-action-500 focus-within:border-action-800"
                : ""
            )}
          >
            <Tiptap assistants={activeAgents} />

            <div className="flex flex-row items-end justify-between gap-2 self-stretch border-t border-structure-100 py-2 pr-2 sm:flex-col sm:border-0">
              <div className="flex gap-5 rounded-full border border-structure-100 px-4 py-2 sm:gap-3 sm:px-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    // focus on the input text after the file selection interaction is over
                    inputRef.current?.focus();
                    const file = e?.target?.files?.[0];
                    if (!file) return;
                    if (file.size > 10_000_000) {
                      sendNotification({
                        type: "error",
                        title: "File too large.",
                        description:
                          "PDF uploads are limited to 10Mb per file. Please consider uploading a smaller file.",
                      });
                      return;
                    }
                    const res = await handleFileUploadToText(file);

                    if (res.isErr()) {
                      sendNotification({
                        type: "error",
                        title: "Error uploading file.",
                        description: res.error.message,
                      });
                      return;
                    }
                    if (res.value.content.length > 1_000_000) {
                      // This error should pretty much never be triggered but it is a possible case, so here it is.
                      sendNotification({
                        type: "error",
                        title: "File too large.",
                        description:
                          "The extracted text from your PDF has more than 1 million characters. This will overflow the assistant context. Please consider uploading a smaller file.",
                      });
                      return;
                    }
                    setContentFragmentFilename(res.value.title);
                    setContentFragmentBody(res.value.content);
                  }}
                />
                <IconButton
                  variant={"tertiary"}
                  icon={AttachmentIcon}
                  size="sm"
                  disabled={!!contentFragmentFilename}
                  tooltip="Add a document to the conversation (10MB maximum, only .txt, .pdf, .md)."
                  tooltipPosition="above"
                  className="flex"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                />
                <AssistantPicker
                  owner={owner}
                  size="sm"
                  onItemClick={(c) => {
                    // We construct the HTML for an AgentMention and inject it in the content
                    // editable with an extra space after it.
                    const mentionNode = getAgentMentionNode(c);
                    const contentEditable =
                      document.getElementById("dust-input-bar");
                    if (contentEditable && mentionNode) {
                      // Add mentionNode as last childe of contentEditable.
                      contentEditable.appendChild(mentionNode);
                      const afterTextNode = document.createTextNode(" ");
                      contentEditable.appendChild(afterTextNode);
                      contentEditable.focus();
                      moveCursorToEnd(contentEditable);
                    }
                  }}
                  assistants={activeAgents}
                  showBuilderButtons={true}
                />
                <div className="hidden sm:flex">
                  <IconButton
                    variant={"tertiary"}
                    icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                    size="sm"
                    className="flex"
                    onClick={() => {
                      setIsExpanded((e) => !e);
                    }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                icon={ArrowUpIcon}
                label="Send"
                labelVisible={false}
                disabledTooltip
                onClick={() => {
                  void handleSubmit();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function FixedAssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  conversationId,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: { title: string; content: string }
  ) => void;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
}) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const filtered = filterAndSortAgents(activeAgents, "");
  console.log(">> filtered:", filtered);

  return (
    <div className="4xl:px-0 fixed bottom-0 left-0 right-0 z-20 flex-initial lg:left-80">
      <div className="mx-auto max-h-screen max-w-4xl pb-0 sm:pb-8">
        <AssistantInputBar
          owner={owner}
          onSubmit={onSubmit}
          conversationId={conversationId}
          stickyMentions={stickyMentions}
        />
      </div>
    </div>
  );
}

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMention | null;
}>({
  animate: false,
  selectedAssistant: null,
});
