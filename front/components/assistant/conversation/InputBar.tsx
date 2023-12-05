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
import React, {
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
  }: {
    owner: WorkspaceType;
    visible: boolean;
    filter: string;
    position: {
      bottom: number;
      left: number;
    };
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

export function AssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  stopGenerationButton,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: { title: string; content: string }
  ) => void;
  stickyMentions?: AgentMention[];
  stopGenerationButton?: React.ReactNode;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExitingFullscreen, setIsExitingFullscreen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({});

  const toggleFullscreen = () => {
    if (ref.current) {
      const currentHeight = `${ref.current.offsetHeight}px`;
      if (!isFullscreen) {
        // Going to fullscreen mode
        setStyle({ height: currentHeight });
        setTimeout(() => {
          setIsFullscreen(true);
          setStyle({ height: "84vh" });
        }, 10); // Timeout to allow the style change to take effect
      } else {
        // Exiting fullscreen mode
        setIsExitingFullscreen(true);
        setTimeout(() => {
          setStyle({ height: "16rem" });
          setTimeout(() => {
            setIsFullscreen(false); // Update isFullscreen after the transition
            setIsExitingFullscreen(false);
            setStyle({}); // Remove the inline style after the transition
          }, 300); // This timeout should match the CSS transition duration
        }, 10);
      }
    }
  };

  const [isInputFocused, setIsInputFocused] = useState(false);
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
  });
  const sendNotification = useContext(SendNotificationsContext);

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const handleSubmit = async () => {
    if (empty) {
      return;
    }
    const contentEditable = document.getElementById("dust-input-bar");
    if (contentEditable) {
      const mentions: MentionType[] = [];
      let content = "";
      Array.from(contentEditable.childNodes).forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
          const agentConfigurationId = node.getAttribute(
            "data-agent-configuration-id"
          );
          // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
          const agentName = node.getAttribute("data-agent-name");

          if (agentConfigurationId && agentName) {
            mentions.push({
              configurationId: agentConfigurationId,
            });
            // Internal format for mentions is `:mention[agentName]{sId=agentConfigurationId}`.
            content += `:mention[${agentName}]{sId=${agentConfigurationId}}`;
          }
        }
        if (node.nodeType === Node.TEXT_NODE) {
          content += node.textContent;
        }
      });

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

      onSubmit(content, mentions, contentFragment);
      contentEditable.innerHTML = "";
      setContentFragmentFilename(undefined);
      setContentFragmentBody(undefined);
    }
  };

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate } = useContext(InputBarContext);
  useEffect(() => {
    if (animate && !isAnimating) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1500);
    }
  }, [animate, isAnimating]);

  const stickyMentionsTextContent = useRef<string | null>(null);

  useEffect(() => {
    if (!stickyMentions) {
      return;
    }

    const mentionedAgentConfigurationIds = new Set(
      stickyMentions?.map((m) => m.configurationId)
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
  }, [stickyMentions, agentConfigurations, stickyMentionsTextContent]);
  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 pr-3 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal"
  );
  return (
    <div
      className={classNames(
        "pointer-events-none absolute bottom-0 right-0 top-0 z-20 h-full w-full overflow-hidden lg:left-80 lg:w-auto",
        "transition-all duration-300",
        isExitingFullscreen ? "" : isFullscreen ? "bg-white/80" : ""
      )}
    >
      <div className="pointer-events-none mx-auto flex h-full max-w-4xl">
        <AgentList
          owner={owner}
          visible={agentListVisible}
          filter={agentListFilter}
          ref={agentListRef}
          position={agentListPosition}
        />
        <div
          className={classNames(
            "pointer-events-auto mb-4 flex w-full flex-1 flex-row items-end px-4 md:mb-8",
            isFullscreen ? "mt-24" : "self-end"
          )}
        >
          <div
            ref={ref}
            style={style}
            className={classNames(
              "flex flex-1 flex-row items-stretch gap-3 pl-5 pr-14",
              "s-backdrop-blur border-element-500 bg-white/80",
              "rounded-3xl transition-all duration-300",

              isExitingFullscreen
                ? "border-2 shadow-lg"
                : isFullscreen
                ? "border drop-shadow-[0_24px_48px_rgba(2,6,23,0.15)]"
                : "border-2 shadow-lg",
              isFullscreen
                ? "focus-within:border-element-500"
                : "max-h-64 min-h-24 focus-within:border-element-600",
              isAnimating
                ? "animate-shake border-action-500 focus-within:border-action-800"
                : ""
            )}
          >
            <div className="absolute -top-[68px] right-0">
              {stopGenerationButton}
            </div>
            <div className="flex flex-1 flex-col gap-y-0">
              {contentFragmentFilename && contentFragmentBody && (
                <div className="border-b border-structure-300/50 pb-3 pt-5">
                  <Citation
                    title={contentFragmentFilename}
                    description={contentFragmentBody?.substring(0, 100)}
                    onClose={() => {
                      setContentFragmentBody(undefined);
                      setContentFragmentFilename(undefined);
                    }}
                  />
                </div>
              )}
              <div
                className={classNames(
                  contentEditableClasses,
                  "scrollbar-hide",
                  "overflow-y-auto",
                  "h-[100%] w-[100%] pb-6 pt-3.5"
                )}
                contentEditable={true}
                ref={inputRef}
                id={"dust-input-bar"}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();

                  // Get the plain text.
                  const text = e.clipboardData.getData("text/plain");

                  // If the text is single line.
                  if (text.indexOf("\n") === -1 && text.indexOf("\r") === -1) {
                    document.execCommand("insertText", false, text);
                    return;
                  }

                  const selection = window.getSelection();
                  if (!selection) {
                    return;
                  }
                  const range = selection.getRangeAt(0);
                  let node = range.endContainer;
                  let offset = range.endOffset;

                  if (
                    // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                    node.getAttribute &&
                    // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                    node.getAttribute("id") === "dust-input-bar"
                  ) {
                    const textNode = document.createTextNode("");
                    node.appendChild(textNode);
                    node = textNode;
                    offset = 0;
                  }

                  if (
                    node.parentNode &&
                    // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                    node.parentNode.getAttribute &&
                    // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                    node.parentNode.getAttribute("id") === "dust-input-bar"
                  ) {
                    // Inject the text at the cursor position.
                    node.textContent =
                      node.textContent?.slice(0, offset) +
                      text +
                      node.textContent?.slice(offset);
                  }

                  // Scroll to the end of the input
                  if (inputRef.current) {
                    setTimeout(() => {
                      const element = inputRef.current;
                      if (element) {
                        element.scrollTop = element.scrollHeight;
                      }
                    }, 0);
                  }

                  // Move the cursor to the end of the paste.
                  const newRange = document.createRange();
                  newRange.setStart(node, offset + text.length);
                  newRange.setEnd(node, offset + text.length);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                }}
                onKeyDown={(e) => {
                  // We prevent the content editable from creating italics, bold and underline.
                  if (e.ctrlKey || e.metaKey) {
                    if (e.key === "u" || e.key === "b" || e.key === "i") {
                      e.preventDefault();
                    }
                  }
                  if (!e.shiftKey && e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleSubmit();
                  }
                }}
                onInput={() => {
                  const selection = window.getSelection();
                  if (
                    selection &&
                    selection.rangeCount !== 0 &&
                    selection.isCollapsed
                  ) {
                    const range = selection.getRangeAt(0);
                    const node = range.endContainer;
                    const offset = range.endOffset;

                    const lastOne = node.textContent
                      ? node.textContent.slice(offset - 1, offset)
                      : null;
                    const preLastOne = node.textContent
                      ? node.textContent.slice(offset - 2, offset - 1)
                      : null;

                    // Mention selection logic.

                    if (
                      lastOne === "@" &&
                      (preLastOne === " " || preLastOne === "") &&
                      node.textContent &&
                      node.parentNode &&
                      // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                      node.parentNode.getAttribute &&
                      // @ts-expect-error - parentNode is the contenteditable, it has a getAttribute.
                      node.parentNode.getAttribute("id") === "dust-input-bar"
                    ) {
                      const mentionSelectNode = document.createElement("div");

                      mentionSelectNode.style.display = "inline-block";
                      mentionSelectNode.setAttribute("key", "mentionSelect");
                      mentionSelectNode.className = "text-brand font-medium";
                      mentionSelectNode.textContent = "@";
                      mentionSelectNode.contentEditable = "false";

                      const inputNode = document.createElement("span");
                      inputNode.setAttribute("ignore", "none");
                      inputNode.className = classNames(
                        "min-w-0 px-0 py-0",
                        "border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0",
                        "text-brand font-medium"
                      );
                      inputNode.contentEditable = "true";

                      mentionSelectNode.appendChild(inputNode);

                      const beforeTextNode = document.createTextNode(
                        node.textContent.slice(0, offset - 1)
                      );
                      const afterTextNode = document.createTextNode(
                        node.textContent.slice(offset)
                      );

                      node.parentNode.replaceChild(beforeTextNode, node);

                      beforeTextNode.parentNode?.insertBefore(
                        afterTextNode,
                        beforeTextNode.nextSibling
                      );
                      beforeTextNode.parentNode?.insertBefore(
                        mentionSelectNode,
                        afterTextNode
                      );

                      const rect = mentionSelectNode.getBoundingClientRect();
                      const position = {
                        left: Math.floor(rect.left) - 24,
                        bottom:
                          Math.floor(window.innerHeight - rect.bottom) + 32,
                      };
                      if (!isNaN(position.left) && !isNaN(position.bottom)) {
                        setAgentListPosition(position);
                      }

                      setAgentListVisible(true);
                      inputNode.focus();

                      inputNode.onblur = () => {
                        let selected = agentListRef.current?.selected();
                        setAgentListVisible(false);
                        setTimeout(() => {
                          setAgentListFilter("");
                          agentListRef.current?.reset();
                        });

                        if (inputNode.getAttribute("ignore") !== "none") {
                          selected = null;
                        }

                        // console.log("SELECTED", selected);

                        // We received a selected agent configration, recover the state of the
                        // contenteditable and inject an AgentMention component.
                        if (selected) {
                          // Construct an AgentMention component and inject it as HTML.
                          const mentionNode = getAgentMentionNode(selected);

                          // This is mainly to please TypeScript.
                          if (!mentionNode || !mentionSelectNode.parentNode) {
                            return;
                          }

                          // Replace mentionSelectNode with mentionNode.
                          mentionSelectNode.parentNode.replaceChild(
                            mentionNode,
                            mentionSelectNode
                          );

                          // Prepend a space to afterTextNode (this will be the space that comes after
                          // the mention).
                          afterTextNode.textContent = ` ${afterTextNode.textContent}`;

                          // If afterTextNode is the last node add an invisible character to prevent a
                          // Chrome bugish behaviour  ¯\_(ツ)_/¯
                          if (afterTextNode.nextSibling === null) {
                            afterTextNode.textContent = `${afterTextNode.textContent}\u200B`;
                          }

                          // Restore the cursor, taking into account the added space.
                          range.setStart(afterTextNode, 1);
                          range.setEnd(afterTextNode, 1);
                          selection.removeAllRanges();
                          selection.addRange(range);
                        }

                        // We didn't receive a selected agent configuration, restore the state of the
                        // contenteditable and re-inject the content that was created during the
                        // selection process into the contenteditable.
                        if (!selected && mentionSelectNode.parentNode) {
                          mentionSelectNode.parentNode.removeChild(
                            mentionSelectNode
                          );

                          range.setStart(afterTextNode, 0);
                          range.setEnd(afterTextNode, 0);
                          selection.removeAllRanges();
                          selection.addRange(range);

                          // Insert the content of mentionSelectNode after beforeTextNode only if
                          // we're not in ignore mode unless we are in ingnore mode (the user
                          // backspaced into the @)
                          if (
                            inputNode.getAttribute("ignore") === "none" ||
                            inputNode.getAttribute("ignore") === "space"
                          ) {
                            const newTextNode = document.createTextNode(
                              (mentionSelectNode.textContent || "") +
                                (inputNode.getAttribute("ignore") === "space"
                                  ? " "
                                  : "")
                            );
                            beforeTextNode.parentNode?.insertBefore(
                              newTextNode,
                              beforeTextNode.nextSibling
                            );
                          }
                        }
                      };

                      // These are events on the small contentEditable that receives the user input
                      // and drives the agent list selection.
                      inputNode.onkeydown = (e) => {
                        // console.log("KEYDOWN", e.key);
                        if (e.key === "Escape") {
                          agentListRef.current?.reset();
                          inputNode.setAttribute("ignore", "escape");
                          inputNode.blur();
                          e.preventDefault();
                        }
                        if (e.key === "ArrowDown") {
                          agentListRef.current?.next();
                          e.preventDefault();
                        }
                        if (e.key === "ArrowUp") {
                          agentListRef.current?.prev();
                          e.preventDefault();
                        }
                        if (e.key === "Backspace") {
                          if (inputNode.textContent === "") {
                            agentListRef.current?.reset();
                            inputNode.setAttribute("ignore", "backspace");
                            inputNode.blur();
                            e.preventDefault();
                          }
                        }
                        if (e.key === " ") {
                          if (agentListRef.current?.perfectMatch()) {
                            inputNode.blur();
                            e.preventDefault();
                          } else {
                            agentListRef.current?.reset();
                            inputNode.setAttribute("ignore", "space");
                            inputNode.blur();
                            e.preventDefault();
                          }
                        }
                        if (e.key === "Enter") {
                          inputNode.blur();
                          e.preventDefault();
                        }
                      };

                      // These are the event that drive the selection of the the agent list, if we
                      // have no more match we just blur to exit the selection process.
                      inputNode.oninput = (e) => {
                        const target = e.target as HTMLInputElement;
                        // console.log("INPUT", target.textContent);
                        setAgentListFilter(target.textContent || "");
                        e.stopPropagation();
                        setTimeout(() => {
                          if (agentListRef.current?.noMatch()) {
                            agentListRef.current?.reset();
                            inputNode.blur();
                          }
                        });
                      };
                    }
                  }
                }}
              >
                <div
                  className={classNames(
                    // This div is placeholder text for the contenteditable
                    contentEditableClasses,
                    "absolute -z-10 overflow-hidden truncate pr-12 text-element-600 dark:text-element-600-dark",
                    empty && !isInputFocused ? "" : "hidden" // Only show when empty and not focused
                  )}
                >
                  Ask a question or get some @help
                </div>
              </div>
            </div>

            <div className="absolute right-4 top-4 z-10 flex">
              <IconButton
                variant={"tertiary"}
                icon={isFullscreen ? FullscreenExitIcon : FullscreenIcon}
                size="xs"
                disabled={!!contentFragmentFilename}
                className="flex"
                onClick={toggleFullscreen}
              />
            </div>
            <div className="absolute bottom-0 right-0 z-10 flex flex-row items-end gap-2 p-2">
              <div className="flex gap-4 rounded-full border border-structure-100 bg-white/80 px-2.5 py-2 backdrop-blur">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    // focus on the input text after the file selection interaction is over
                    inputRef.current?.focus();
                    const file = e?.target?.files?.[0];
                    if (!file) return;
                    if (file.size > 5_000_000) {
                      sendNotification({
                        type: "error",
                        title: "File too large.",
                        description:
                          "PDF uploads are limited to 5Mb per file. Please consider uploading a smaller file.",
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
                  tooltip="Add a document to the conversation (5MB maximum, only .txt, .pdf, .md)."
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
    </div>
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

  return (
    <AssistantInputBar
      owner={owner}
      onSubmit={onSubmit}
      stickyMentions={stickyMentions}
      stopGenerationButton={
        generationContext.generatingMessageIds.length > 0 && (
          <Button
            className="mt-4"
            variant="tertiary"
            label={isProcessing ? "Stopping generation..." : "Stop generation"}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isProcessing}
          />
        )
      }
    />
  );
}

export const InputBarContext = createContext({ animate: false });

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
