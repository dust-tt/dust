import { DropdownMenu, PaperAirplaneIcon, RobotIcon } from "@dust-tt/sparkle";
import {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as ReactDOMServer from "react-dom/server";

import { useAgentConfigurations } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { MentionType } from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

function AgentMention({
  agentConfiguration,
}: {
  agentConfiguration: AgentConfigurationType;
}) {
  return (
    <div
      className={classNames(
        "inline-block rounded-sm px-1 py-0.5 text-xs font-bold",
        "bg-gray-200"
      )}
      contentEditable={false}
      data-agent-configuration={agentConfiguration?.sId}
    >
      {agentConfiguration.name}
    </div>
  );
}

// COMMAND LIST

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
  }>
) {
  const [focus, setFocus] = useState<number>(0);

  const focusRef = useRef<HTMLDivElement>(null);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  const filtered = agentConfigurations.filter((a) => {
    return (
      filter.length === 0 ||
      a.name.toLowerCase().startsWith(filter.toLowerCase())
    );
  });

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
  }));

  useEffect(() => {
    if (focus > filtered.length - 1) {
      setFocus(filtered.length - 1);
    }
    if (focusRef.current) {
      focusRef.current.scrollIntoView({
        // behavior: 'smooth',
        block: "nearest",
        inline: "start",
      });
    }
  }, [focus, visible, filter, filtered]);

  return (
    <>
      {visible ? (
        <div
          className="fixed z-30 w-64 rounded-xl bg-red-100 shadow-xl"
          style={{
            bottom: position.bottom,
            left: position.left,
          }}
        >
          <div className="flex flex-col">
            <div className="flex-1"></div>
            <div className="z-10 flex flex-col overflow-auto rounded-xl border bg-white">
              {filtered.map((c, i) => (
                <div
                  className="flex w-full px-1"
                  key={c.name}
                  ref={focus === i ? focusRef : null}
                >
                  <div
                    className={classNames(
                      "flex w-full cursor-pointer flex-col"
                    )}
                    onClick={() => {
                      setFocus(i);
                    }}
                    onMouseEnter={() => {
                      setFocus(i);
                    }}
                  >
                    <div className={classNames("flex flex-initial py-1")}>
                      <div
                        className={classNames(
                          "flex-initial py-1 pl-2 pr-2 font-medium",
                          focus === i ? "text-action-500" : "text-element-800"
                        )}
                      >
                        {"@"}
                        {c.name}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 ? (
                <div className="flex items-center justify-center">
                  <div className="flex-col">
                    <p className="text-gray-500">No match</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const AgentList = forwardRef(AgentListImpl);

export function AssistantInputBar({
  owner,
  onSubmit,
}: {
  owner: WorkspaceType;
  onSubmit: (input: string, mentions: MentionType[]) => void;
}) {
  const [input, setInput] = useState("");
  const [agentListVisible, setAgentListVisible] = useState(false);
  const [agentListFilter, setAgentListFilter] = useState("");
  const [agentListPosition, setAgentListPosition] = useState<{
    bottom: number;
    left: number;
  }>({
    bottom: 0,
    left: 0,
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const agentListRef = useRef<{
    prev: () => void;
    next: () => void;
    reset: () => void;
    selected: () => AgentConfigurationType | null;
    noMatch: () => boolean;
  }>(null);

  useEffect(() => {
    inputRef.current?.focus();
  });

  return (
    <>
      <AgentList
        owner={owner}
        visible={agentListVisible}
        filter={agentListFilter}
        ref={agentListRef}
        position={agentListPosition}
      />
      <div className="flex flex-1">
        <div className="flex flex-1 flex-row items-center">
          <div
            className={classNames(
              "flex flex-1 flex-row items-end items-stretch px-2",
              "border-2 border-action-200 bg-white focus-within:border-action-300",
              "rounded-sm rounded-xl drop-shadow-2xl  "
            )}
          >
            <div
              className="inline-block w-full resize-none overflow-auto whitespace-pre-wrap px-3 py-3 font-normal outline-0 focus:outline-0"
              contentEditable={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  if (e.key === "u" || e.key === "b" || e.key === "i") {
                    e.preventDefault();
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    //onSubmit();
                  }
                }
              }}
              onInput={(e) => {
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

                  // MENTION WIDGET

                  if (
                    lastOne === "@" &&
                    (preLastOne === " " || preLastOne === "") &&
                    node.textContent &&
                    node.parentNode
                  ) {
                    console.log("create textNode");
                    const textNode = document.createTextNode(
                      node.textContent.slice(0, offset - 1)
                    );

                    console.log("create mentionNode");
                    const mentionSelectNode = document.createElement("div");
                    mentionSelectNode.style.display = "inline-block";
                    mentionSelectNode.setAttribute("key", "mentionSelect");
                    mentionSelectNode.className = "text-brand font-medium";
                    mentionSelectNode.textContent = "@";
                    mentionSelectNode.contentEditable = "false";

                    const inputNode = document.createElement("span");
                    //inputNode.setAttribute("type", "text");
                    //inputNode.setAttribute("placeholder", "");
                    inputNode.className =
                      "min-w-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-brand font-medium px-0 py-0";
                    inputNode.contentEditable = "true";

                    mentionSelectNode.appendChild(inputNode);

                    const textNode2 = document.createTextNode(
                      node.textContent.slice(offset)
                    );

                    node.parentNode.replaceChild(textNode, node);
                    textNode.parentNode?.insertBefore(
                      textNode2,
                      textNode.nextSibling
                    );
                    textNode.parentNode?.insertBefore(
                      mentionSelectNode,
                      textNode2
                    );

                    console.log("inserted  + setAgentListVisible(true)");

                    const rect = mentionSelectNode.getBoundingClientRect();
                    const position = {
                      left: Math.floor(rect.left) - 24,
                      bottom: Math.floor(window.innerHeight - rect.bottom) + 32,
                    };
                    if (!isNaN(position.left) && !isNaN(position.bottom)) {
                      setAgentListPosition(position);
                    }

                    setAgentListVisible(true);
                    inputNode.focus();

                    inputNode.onblur = () => {
                      const selected =
                        agentListRef.current?.selected() as AgentConfigurationType | null;
                      setAgentListVisible(false);
                      setAgentListFilter("");
                      agentListRef.current?.reset();

                      console.log("SELECTED", selected);

                      if (selected) {
                        const htmlString = ReactDOMServer.renderToStaticMarkup(
                          <AgentMention agentConfiguration={selected} />
                        );
                        // const htmlString = ReactDOMServer.renderToStaticMarkup(
                        //   <span className="text-red-900 font-bold">
                        //     /{selected.name}
                        //   </span>
                        // );
                        const wrapper = document.createElement("div");
                        wrapper.innerHTML = htmlString.trim();
                        const mentionNode = wrapper.firstChild;

                        if (!mentionNode || !mentionNode.parentNode) {
                          return;
                        }

                        // Replace tabSelectNode with mentionSelectNode.
                        mentionSelectNode.parentNode.replaceChild(
                          mentionNode,
                          mentionSelectNode
                        );

                        // Prepend a space to textNode2 (this will be the space that comes after the
                        // mention).
                        textNode2.textContent = ` ${textNode2.textContent}`;

                        // If textNode2 is the last node add a `\n` just because ¯\_(ツ)_/¯
                        if (textNode2.nextSibling === null) {
                          textNode2.textContent = `${textNode2.textContent}\n`;
                        }

                        // Restore the cursor, taking into account the added space.
                        range.setStart(textNode2, 1);
                        range.setEnd(textNode2, 1);
                        selection.removeAllRanges();
                        selection.addRange(range);
                      } else if (mentionSelectNode.parentNode) {
                        // Remove mentionSelectNode restore cursor and re-add @
                        mentionSelectNode.parentNode.removeChild(
                          mentionSelectNode
                        );

                        range.setStart(textNode2, 0);
                        range.setEnd(textNode2, 0);
                        selection.removeAllRanges();
                        selection.addRange(range);

                        // insert the content of mentionSelectNode before textNode2
                        const textNode3 = document.createTextNode(
                          mentionSelectNode.textContent || ""
                        );
                        textNode.parentNode?.insertBefore(
                          textNode3,
                          textNode.nextSibling
                        );
                      }
                      // const s = new CmdState().updatedFromChildNodes(
                      //   e.target.childNodes
                      // );
                      // onStateUpdate(s);
                    };

                    inputNode.onkeydown = (e) => {
                      console.log("KEYDOWN", e.key);
                      if (e.key === "Escape") {
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
                          inputNode.blur();
                          e.preventDefault();
                        }
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        inputNode.blur();
                        e.preventDefault();
                      }
                    };

                    inputNode.oninput = (e) => {
                      if (
                        e.target &&
                        typeof e.target.textContent === "string"
                      ) {
                        console.log("INPUT", e.target.textContent);
                        setAgentListFilter(e.target.textContent);
                        e.stopPropagation();
                        setTimeout(() => {
                          if (agentListRef.current?.noMatch()) {
                            agentListRef.current?.reset();
                            inputNode.blur();
                          }
                        });
                      }
                    };
                  }
                }

                // const s = new CmdState().updatedFromChildNodes(
                //   e.target.childNodes
                // );
                // onStateUpdate(s);
              }}
              suppressContentEditableWarning={true}
            ></div>

            {/**
            <TextareaAutosize
              minRows={1}
              placeholder={"Ask a question"}
              className={classNames(
                "flex w-full resize-none border-0 bg-white text-base ring-0 focus:ring-0",
                "text-element-800",
                "placeholder-gray-400",
                "px-3 py-3"
              )}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              ref={inputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && input.length > 0) {
                  void onSubmit(input, []);
                  e.preventDefault();
                  setInput("");
                }
              }}
              autoFocus={true}
            />
 */}
            <div className={classNames("z-10 flex flex-row space-x-3 pr-2")}>
              <div className="flex flex-col justify-center">
                <DropdownMenu>
                  <DropdownMenu.Button icon={RobotIcon} />
                  <DropdownMenu.Items origin="bottomRight">
                    <DropdownMenu.Item label="item 1" href="#" />
                    <DropdownMenu.Item label="item 2" href="#" />
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>

              <PaperAirplaneIcon
                className={classNames(
                  "my-auto h-5 w-5",
                  input.length === 0
                    ? "text-gray-400"
                    : "cursor-pointer text-action-500"
                )}
                onClick={() => {
                  if (input.length === 0) {
                    return;
                  }
                  void onSubmit(input, []);
                  setInput("");
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
}: {
  owner: WorkspaceType;
  onSubmit: (input: string, mentions: MentionType[]) => void;
}) {
  return (
    <div className="4xl:px-0 fixed bottom-0 left-0 right-0 z-20 flex-initial px-2 lg:left-80">
      <div className="mx-auto max-w-4xl pb-12">
        <AssistantInputBar owner={owner} onSubmit={onSubmit} />
      </div>
    </div>
  );
}
