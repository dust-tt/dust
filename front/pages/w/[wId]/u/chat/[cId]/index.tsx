import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowDownIcon,
  Item,
  Logo,
  PageHeader,
  PaperAirplaneSolidIcon,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  ClipboardDocumentListIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import {
  ClipboardDocumentCheckIcon as ClipboardDocumentCheckIconFull,
  UserCircleIcon,
} from "@heroicons/react/24/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import remarkGfm from "remark-gfm";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Spinner } from "@app/components/Spinner";
import TimeRangePicker, {
  ChatTimeRange,
  timeRanges,
} from "@app/components/use/chat/ChatTimeRangePicker";
import {
  FeedbackHandler,
  MessageFeedback,
} from "@app/components/use/chat/MessageFeedback";
import { runActionStreamed } from "@app/lib/actions/client";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { getChatSessionWithMessages } from "@app/lib/api/chat";
import {
  Authenticator,
  getSession,
  getUserFromSession,
  prodAPICredentialsForOwner,
} from "@app/lib/auth";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { DustAPI, DustAPICredentials } from "@app/lib/dust_api";
import { useChatSessions } from "@app/lib/swr";
import { client_side_new_id } from "@app/lib/utils";
import { classNames } from "@app/lib/utils";
import {
  ChatMessageType,
  ChatRetrievedDocumentType,
  ChatSessionType,
  MessageFeedbackStatus,
  MessageRole,
} from "@app/types/chat";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

const PROVIDER_LOGO_PATH: { [provider: string]: string } = {
  notion: "/static/notion_32x32.png",
  slack: "/static/slack_32x32.png",
  google_drive: "/static/google_drive_32x32.png",
  github: "/static/github_black_32x32.png",
};

type DataSource = {
  name: string;
  description?: string;
  provider: ConnectorProvider | "none";
  selected: boolean;
};

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  workspaceDataSources: DataSource[];
  prodCredentials: DustAPICredentials;
  chatSession: ChatSessionType;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const prodAPI = new DustAPI(prodCredentials);

  const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  if (dsRes.isErr()) {
    return {
      notFound: true,
    };
  }

  const dataSources: DataSource[] = dsRes.value.map((ds) => {
    return {
      name: ds.name,
      description: ds.description,
      provider: ds.connectorProvider || "none",
      selected: ds.connectorProvider ? true : false,
    };
  });

  // Select Data Sources if none are managed.
  if (!dataSources.some((ds) => ds.provider !== "none")) {
    for (const ds of dataSources) {
      ds.selected = true;
    }
  }

  // Manged first, then alphabetically
  dataSources.sort((a, b) => {
    if (a.provider === "none") {
      return b.provider === "none" ? 0 : 1;
    }
    if (b.provider === "none") {
      return -1;
    }
    if (a.provider < b.provider) {
      return -1;
    } else {
      return 1;
    }
  });

  const cId = context.params?.cId as string;
  const chatSession = await getChatSessionWithMessages(auth, cId);

  if (!chatSession) {
    return {
      props: {
        user,
        owner,
        workspaceDataSources: dataSources,
        prodCredentials,
        chatSession: {
          id: 0,
          userId: user?.id || 0,
          sId: cId,
          created: Date.now(),
          messages: [],
        },
        readOnly: false,
        gaTrackingId: GA_TRACKING_ID,
      },
    };
  } else {
    return {
      props: {
        user,
        owner,
        workspaceDataSources: dataSources,
        prodCredentials,
        chatSession,
        readOnly: user?.id !== chatSession.userId,
        gaTrackingId: GA_TRACKING_ID,
      },
    };
  }
};

const providerFromDocument = (document: ChatRetrievedDocumentType) => {
  let provider = "none";
  if (document.dataSourceId.startsWith("managed-slack")) {
    provider = "slack";
  }
  if (document.dataSourceId.startsWith("managed-notion")) {
    provider = "notion";
  }
  if (document.dataSourceId.startsWith("managed-google_drive")) {
    provider = "google_drive";
  }
  if (document.dataSourceId.startsWith("managed-github")) {
    provider = "github";
  }
  return provider;
};

const titleFromDocument = (document: ChatRetrievedDocumentType) => {
  let title = document.documentId;
  // Try to look for a title tag.
  for (const tag of document.tags) {
    if (tag.startsWith("title:")) {
      title = tag.substring("title:".length);
    }
  }

  if (document.dataSourceId.startsWith("managed-slack")) {
    for (const tag of document.tags) {
      if (tag.startsWith("channelName:")) {
        title = "#" + tag.substring("channelName:".length);
      }
    }
  }
  return title;
};

export function DocumentView({
  document,
}: {
  document: ChatRetrievedDocumentType;
}) {
  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);
  const [chunkExpanded, setChunkExpanded] = useState(false);

  const provider = providerFromDocument(document);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center text-xs">
        <div
          className={classNames(
            "flex flex-initial select-none rounded-md bg-gray-100 px-1 py-0.5",
            document.chunks.length > 0 ? "cursor-pointer" : "",
            chunkExpanded
              ? "bg-gray-300"
              : document.chunks.length > 0
              ? "hover:bg-gray-200"
              : ""
          )}
          onClick={() => {
            if (document.chunks.length > 0) {
              setChunkExpanded(!chunkExpanded);
            }
          }}
        >
          {document.score.toFixed(2)}
        </div>
        <div className="ml-2 flex flex-initial">
          <div className={classNames("mr-1 flex h-4 w-4")}>
            {provider !== "none" ? (
              <img src={PROVIDER_LOGO_PATH[provider]}></img>
            ) : (
              <DocumentDuplicateIcon className="h-4 w-4 text-slate-500" />
            )}
          </div>
        </div>
        <div className="flex flex-initial">
          <a
            href={document.sourceUrl || ""}
            target={"_blank"}
            className="block w-32 truncate text-gray-600 sm:w-fit"
          >
            {titleFromDocument(document)}
          </a>
          <span className="ml-1 text-gray-400">
            {document.timestamp.split(" ")[0]}
          </span>
        </div>
      </div>
      {chunkExpanded && (
        <div className="my-2 flex flex-col space-y-2">
          {document.chunks.map((chunk, i) => (
            <div key={i} className="flex flex-initial">
              <div
                className="ml-10 border-l-4 border-slate-400"
                onClick={() => {
                  expandedChunkId == i
                    ? setExpandedChunkId(null)
                    : setExpandedChunkId(i);
                }}
              >
                <p
                  className={classNames(
                    "cursor-pointer pl-2 text-xs italic text-gray-500",
                    expandedChunkId === i ? "" : "line-clamp-2"
                  )}
                >
                  {chunk.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const getTimestampFromTimeSettings = function (
  selectedTimeRange: ChatTimeRange,
  minTimestamp?: number
) {
  if (selectedTimeRange.id === "auto" && minTimestamp) {
    // add margin of max(1 day, 25% of the time range)
    const margin = Math.floor(
      Math.max(24 * 60 * 60 * 1000, (Date.now() - minTimestamp) * 0.25)
    );
    return minTimestamp > 0 ? minTimestamp - margin : 0;
  } else if (
    selectedTimeRange.id !== "all" &&
    selectedTimeRange.id !== "auto"
  ) {
    return Date.now() - selectedTimeRange.ms;
  }
  return 0;
};

export function RetrievalsView({
  message,
  isLatest,
}: {
  message: ChatMessageType;
  isLatest: boolean;
}) {
  const [summary, setSummary] = useState<{
    [data_source_id: string]: { count: number; provider: string };
  }>({});
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (message.retrievals && message.retrievals.length > 0) {
      const summary = {} as {
        [key: string]: { count: number; provider: string };
      };
      message.retrievals.forEach((r: ChatRetrievedDocumentType) => {
        const provider = providerFromDocument(r);
        if (r.dataSourceId in summary) {
          summary[r.dataSourceId].count += 1;
        } else {
          summary[r.dataSourceId] = {
            provider,
            count: 1,
          };
        }
      });
      setSummary(summary);
    }
  }, [message.retrievals]);

  return !(message.retrievals && message.retrievals.length === 0) ? (
    <div className="ml-12 flex flex-col">
      <div className="flex flex-row items-center">
        <div
          className={classNames(
            "flex flex-initial flex-row items-center space-x-2",
            "rounded px-2 py-1",
            "text-xs font-bold text-gray-700",
            isLatest ? "bg-orange-100" : "bg-gray-100"
          )}
        >
          {message.retrievals && message.retrievals.length > 0 && (
            <>
              <div className="flex flex-initial">Retrieved</div>
              {Object.keys(summary).map((k) => {
                return (
                  <div
                    key={k}
                    className="flex flex-initial flex-row items-center"
                  >
                    <div className={classNames("mr-1 flex h-4 w-4")}>
                      {summary[k].provider !== "none" ? (
                        <img
                          src={PROVIDER_LOGO_PATH[summary[k].provider]}
                        ></img>
                      ) : (
                        <DocumentDuplicateIcon className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-initial text-gray-700">
                      {summary[k].count}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-initial">
                {expanded ? (
                  <ChevronDownIcon
                    className="h-4 w-4 cursor-pointer"
                    onClick={() => {
                      setExpanded(false);
                    }}
                  />
                ) : (
                  <ChevronRightIcon
                    className="h-4 w-4 cursor-pointer"
                    onClick={() => {
                      setExpanded(true);
                    }}
                  />
                )}
              </div>
            </>
          )}
          {!message.retrievals && (
            <div className="loading-dots">Retrieving docs</div>
          )}
        </div>
      </div>
      {expanded && message.retrievals && (
        <>
          {message.params?.query && (
            <div className="mt-1 flex flex-initial text-xs font-normal italic text-gray-400">
              Computed query: {message.params?.query}
            </div>
          )}
          {message.params?.minTimestamp ? (
            <div className="mt-1 flex flex-initial text-xs font-normal italic text-gray-400">
              Documents retrieved created or updated after{" "}
              {(() => {
                const date = new Date(message.params?.minTimestamp || 0);
                const options = {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                } as Intl.DateTimeFormatOptions;
                const dateString = date.toLocaleDateString(undefined, options);
                return dateString;
              })()}
            </div>
          ) : (
            ""
          )}
          <div className="ml-4 mt-2 flex flex-col space-y-1">
            {message.retrievals.map(
              (r: ChatRetrievedDocumentType, i: number) => {
                return <DocumentView document={r} key={i} />;
              }
            )}
          </div>
        </>
      )}
    </div>
  ) : null;
}

function toMarkdown(message: ChatMessageType): JSX.Element {
  // Avoid rendering the markdown all the time: only for assistant messages
  if (message.role === "assistant" && message.message) {
    return (
      <ReactMarkdown
        className={classNames(
          "pr-6 [&_ol]:list-decimal [&_ol]:whitespace-normal [&_ol]:pl-4 [&_ul]:whitespace-normal [&_ul]:pl-4" /* ol, ul */,
          "[&_p]:mb-2" /* p */,
          "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5" /* code */
        )}
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return (
              <Link href={href ? href : ""} target="_blank">
                <span className="text-blue-600 hover:underline">
                  {children}
                </span>
              </Link>
            );
          },
        }}
      >
        {message.message || ""}
      </ReactMarkdown>
    );
  }
  return <span>{message.message}</span>;
}

function CopyToClipboardElement({ message }: { message: ChatMessageType }) {
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [tooltip, setTooltip] = useState<boolean>(false);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const handleClick = async () => {
    // cancel tooltip display if user clicks before tooltip appears
    timer && clearTimeout(timer);
    await navigator.clipboard.writeText(message.message as string);
    setConfirmed(true);
    setTooltip(false);
    void setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <div
      className={classNames(
        "absolute -top-1.5 right-0 mt-2 cursor-pointer cursor-pointer hover:text-action-600 group-hover:block",
        confirmed ? "text-action-500" : "text-grey-400 hidden"
      )}
      onClick={handleClick}
      onMouseEnter={() => setTimer(setTimeout(() => setTooltip(true), 1000))}
      onMouseLeave={() => {
        // in case user left before tooltip appears, cancel timer
        timer && clearTimeout(timer);
        setTooltip(false);
      }}
    >
      {confirmed ? (
        <ClipboardDocumentCheckIconFull className="h-4 w-4" />
      ) : (
        <ClipboardDocumentListIcon className="h-4 w-4" />
      )}
      {tooltip ? (
        <div
          className="absolute bottom-4 right-0 w-max rounded border bg-white px-1 py-1"
          onMouseEnter={() => void setTimeout(() => setTooltip(false), 200)}
        >
          <span className="font-normal text-gray-600">
            Copy message to clipboard
          </span>
        </div>
      ) : (
        ""
      )}
    </div>
  );
}

export function MessageView({
  user,
  message,
  loading,
  isLatestRetrieval,
  readOnly,
  feedback,
}: {
  user: UserType | null;
  message: ChatMessageType;
  loading: boolean;
  isLatestRetrieval: boolean;
  readOnly: boolean;
  feedback?: { handler: FeedbackHandler; hover: boolean } | false;
}) {
  return (
    <div className="group">
      {message.role === "retrieval" ? (
        <div className="flex flex-row">
          <RetrievalsView message={message} isLatest={isLatestRetrieval} />
        </div>
      ) : (
        <div
          className={classNames(
            "my-2 flex flex-row items-start",
            message.role === "user" ? "my-6" : ""
          )}
        >
          <div
            className={classNames(
              "min-w-10 flex h-10 w-10 flex-initial rounded-xl",
              "bg-structure-200"
            )}
          >
            {message.role === "assistant" ? (
              <Logo
                shape="square"
                type="colored-grey"
                className={classNames(
                  "mx-2 my-2 h-6 w-6",
                  loading ? "animate-pulse" : ""
                )}
              ></Logo>
            ) : (
              <div className="flex">
                {!readOnly && user?.image ? (
                  <img
                    className="h-10 w-10 rounded-xl"
                    src={user?.image}
                    alt=""
                  />
                ) : (
                  <UserCircleIcon className="mx-2 my-2 h-6 w-6 text-slate-500"></UserCircleIcon>
                )}
              </div>
            )}
          </div>
          <div
            className={classNames(
              "break-word relative ml-2 flex flex-1 flex-col whitespace-pre-wrap pt-2",
              message.role === "user" ? "italic text-gray-500" : "text-gray-700"
            )}
          >
            {toMarkdown(message)}
            {message.role === "assistant" && message.message ? (
              <CopyToClipboardElement message={message} />
            ) : (
              ""
            )}
          </div>
          {feedback && (
            <MessageFeedback
              message={message}
              feedbackHandler={feedback.handler}
              hover={feedback.hover}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChatMenu({
  owner,
  sessions,
  onNewConversation,
  canStartConversation,
}: {
  owner: WorkspaceType;
  sessions: ChatSessionType[];
  onNewConversation: () => void;
  canStartConversation: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex grow flex-col">
      <div className="flex flex-row px-2">
        <div className="flex grow"></div>
        <Button
          disabled={!canStartConversation}
          labelVisible={true}
          label="New Conversation"
          icon={ChatBubbleBottomCenterPlusIcon}
          onClick={onNewConversation}
          className="flex flex-initial"
        />
      </div>
      <div className="mt-4 flex h-0 min-h-full grow overflow-y-auto">
        <div className="flex grow flex-col">
          <div className="flex flex-row items-center">
            <div className="px-8 py-4 text-xs uppercase text-slate-400">
              Past Conversations
            </div>
          </div>
          <div className="flex ">
            <div className="flex w-full flex-col">
              {sessions.length === 0
                ? null
                : sessions.map((s) => {
                    return (
                      <Item
                        key={s.sId}
                        size="sm"
                        selected={router.query.cId === s.sId}
                        label={s.title || ""}
                        className="pl-8 pr-4"
                        href={`/w/${owner.sId}/u/chat/${s.sId}`}
                      ></Item>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppChat({
  user,
  owner,
  workspaceDataSources,
  prodCredentials,
  chatSession,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const prodAPI = new DustAPI(prodCredentials);

  const [title, setTitle] = useState<string>(
    chatSession.title || "New Conversation"
  );
  const [messages, setMessages] = useState<ChatMessageType[]>(
    chatSession.messages || []
  );
  const [canStartConversation, setCanStartConversation] = useState<boolean>(
    workspaceDataSources.length > 0
  );

  useEffect(() => {
    setCanStartConversation(workspaceDataSources.length > 0);
  }, [workspaceDataSources]);

  useEffect(() => {
    setTitle(chatSession.title || "New Conversation");
    setMessages(chatSession.messages || []);
    inputRef.current?.focus();
  }, [chatSession]);

  const [dataSources, setDataSources] = useState(workspaceDataSources);
  // for testing, engs & dust users  have "auto" as default; others have "all"
  const [selectedTimeRange, setSelectedTimeRange] = useState<ChatTimeRange>(
    timeRanges[4]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatMessageType | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (window && window.scrollTo) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [messages, response]);

  const handleInputUpdate = (input: string) => {
    setInput(input);
  };

  const handleSwitchDataSourceSelection = (name: string) => {
    const newSelection = dataSources.map((ds) => {
      if (ds.name === name) {
        return {
          ...ds,
          selected: !ds.selected,
        };
      } else {
        return ds;
      }
    });
    setDataSources(newSelection);
  };

  const handleTimeRangeChange = (timeRange: ChatTimeRange) => {
    setSelectedTimeRange(timeRange);
  };

  const handleNew = async () => {
    // Redirect to new chat session.
    setInput("");
    void router.push(`/w/${owner.sId}/u/chat`);
  };

  const updateTitle = async (title: string, messages: ChatMessageType[]) => {
    const m = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );

    const config = cloneBaseConfig(DustProdActionRegistry["chat-title"].config);

    const context = {
      user: {
        username: user?.username,
        full_name: user?.name,
      },
      workspace: owner.name,
      date_today: new Date().toISOString().split("T")[0],
    };

    const res = await runActionStreamed(owner, "chat-title", config, [
      { messages: m, context },
    ]);
    if (res.isErr()) {
      return title;
    }

    const { eventStream } = res.value;

    for await (const event of eventStream) {
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            title = (e.value as { title: string }).title;
          }
        }
      }
    }

    setTitle(title);
    return title;
  };

  const upsertNewMessage = async (
    message: ChatMessageType
  ): Promise<boolean> => {
    // Upsert new message by making a REST call to the backend.
    const res = await fetch(
      `/api/w/${owner.sId}/use/chats/${chatSession.sId}/messages/${message.sId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );
    if (res.ok) {
      return true;
    } else {
      const data = await res.json();
      window.alert(`Error saving message: ${data.error.message}`);
      return false;
    }
  };

  const deleteMessage = async (message: ChatMessageType) => {
    // Delete message by making a REST call to the backend.
    const res = await fetch(
      `/api/w/${owner.sId}/use/chats/${chatSession.sId}/messages/${message.sId}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      return true;
    } else {
      const data = await res.json();
      window.alert(`Error deleting message: ${data.error.message}`);
      return false;
    }
  };

  const updateMessageFeedback = async (
    message: ChatMessageType,
    feedback: MessageFeedbackStatus
  ): Promise<boolean> => {
    // Update message feedback by making a REST call to the backend.
    const res = await fetch(
      `/api/w/${owner.sId}/use/chats/${chatSession.sId}/messages/${message.sId}/feedback`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedback }),
      }
    );
    if (res.ok) {
      return true;
    } else {
      const data = await res.json();
      window.alert(`Error updating feedback: ${data.error.message}`);
      return false;
    }
  };

  const upsertChatSession = async (title: string) => {
    const res = await fetch(
      `/api/w/${owner.sId}/use/chats/${chatSession.sId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
        }),
      }
    );
    if (res.ok) {
      return true;
    } else {
      const data = await res.json();
      window.alert(`Error saving chat: ${data.error.message}`);
      return false;
    }
  };

  const runChatRetrieval = async (
    m: ChatMessageType[],
    { query, minTimestamp }: { query: string; minTimestamp: number }
  ) => {
    const config = cloneBaseConfig(
      DustProdActionRegistry["chat-retrieval"].config
    );
    config.DATASOURCE.data_sources = dataSources
      .filter((ds) => ds.selected)
      .map((ds) => {
        return {
          workspace_id: prodAPI.workspaceId(),
          data_source_id: ds.name,
        };
      });

    config.DATASOURCE.filter = {
      timestamp: { gt: minTimestamp },
    };
    const res = await runActionStreamed(owner, "chat-retrieval", config, [
      {
        messages: [{ role: "query", message: query }],
        userContext: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          localeString: navigator.language,
        },
      },
    ]);
    if (res.isErr()) throw new Error(res.error.message);

    const { eventStream } = res.value;
    for await (const event of eventStream) {
      if (event.type === "error") throw new Error(event.content.message);
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "DATASOURCE" && e.error)
          throw new Error(e.error);
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            return {
              role: "retrieval",
              retrievals: (
                e.value as { retrievals: ChatRetrievedDocumentType[] }
              ).retrievals,
            } as ChatMessageType;
          } else
            throw new Error("Error in chat retrieval execution: " + e.error);
        }
      }
    }
    throw new Error("Error: no OUTPUT block streamed.");
  };

  const filterMessagesForModel = (
    messages: ChatMessageType[]
  ): ChatMessageType[] => {
    // remove retrieval messages except the last one, and only keep the last 8 user messages

    const lastRetrievalMessageIndex = messages
      .map((m, i) => (m.role === "retrieval" ? i : -1))
      .filter((i) => i !== -1)
      .pop();

    const eighthButLastUserMessageIndex =
      messages
        .map((m, i) => (m.role === "user" ? i : -1))
        .filter((i) => i !== -1)
        .reverse()[7] || 0;

    const result = messages.filter(
      (m, i) =>
        i >= eighthButLastUserMessageIndex &&
        (m.role !== "retrieval" || i === lastRetrievalMessageIndex)
    );
    return result;
  };

  const runChatAssistant = async (
    m: ChatMessageType[],
    retrievalMode: string
  ): Promise<ChatMessageType> => {
    const assistantMessage: ChatMessageType = {
      sId: client_side_new_id(),
      role: "assistant",
      message: "",
    };
    setResponse(assistantMessage);

    const config = cloneBaseConfig(
      DustProdActionRegistry["chat-assistant-wfn"].config
    );
    config.MODEL.function_call = retrievalMode;
    const context = {
      user: {
        username: user?.username,
        full_name: user?.name,
      },
      workspace: owner.name,
      date_today: new Date().toISOString().split("T")[0],
    };

    const res = await runActionStreamed(owner, "chat-assistant-wfn", config, [
      { messages: filterMessagesForModel(m), context },
    ]);
    if (res.isErr()) throw new Error(res.error.message);
    const { eventStream } = res.value;
    for await (const event of eventStream) {
      if (event.type === "tokens") {
        const message = assistantMessage.message + event.content.tokens.text;
        setResponse({
          ...assistantMessage,
          message: message,
        });
        assistantMessage.message = message;
      }
      if (event.type === "error") throw new Error(event.content.message);
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "MODEL" && e.error) {
          throw new Error(e.error);
        }
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            return e.value as ChatMessageType;
          } else {
            throw new Error("Error in chat assistant execution: " + e.error);
          }
        }
      }
    }
    throw new Error("Error: no OUTPUT block streamed.");
  };

  const updateMessages = async (
    messages: ChatMessageType[],
    newMessage: ChatMessageType
  ): Promise<void> => {
    if (!newMessage.sId) newMessage.sId = client_side_new_id();
    if (newMessage.role !== "error") await upsertNewMessage(newMessage);
    messages.push(newMessage);
    setMessages(messages);
    setResponse(null);
  };

  async function filterErrorMessages(m: ChatMessageType[]): Promise<void> {
    // remove last message if it's an error, and the previous messages until the
    // last user message, included
    if (m.length === 0 || m[m.length - 1].role !== "error") return;
    let message = m.pop(); // remove error message which has not been stored
    while (m.length > 0 && (message = m.pop())?.role !== "user")
      await deleteMessage(message as ChatMessageType); // remove messages until last user message
    if (message?.role === "user") await deleteMessage(message); // also remove last user message
  }

  const handleSubmit = async () => {
    /* Document retrieval is handled by an openai function called
     * "retrieve_documents". This function is speced for the openai api in the
     * dust app "chat-assistant-wfn". By default, the chat model decides
     * whether to run the retrieval function or not. The user can override this
     * by prepending the message with "/retrieve" or "/follow-up" which will
     * either force or prevent the model from generating a function call. This
     * behaviour is stored in `retrievalMode`*/
    let retrievalMode = "auto";
    let processedInput = input;

    if (input.startsWith("/retrieve")) {
      processedInput = input.substring("/retrieve".length).trim();
    }
    if (input.startsWith("/follow-up")) {
      retrievalMode = "none";
      processedInput = input.substring("/follow-up".length).trim();
    }

    // clone messages add new message to the end
    const m = [...messages];
    // error messages and messages that caused them are removed from the conversation
    // to avoid the assistant to get confused. They are not persisted in the database,
    // since that happens only later on after successful run of the assistant.
    await filterErrorMessages(m);
    const userMessage: ChatMessageType = {
      sId: client_side_new_id(),
      role: "user",
      message: processedInput,
    };

    // on first message, persist chat session
    if (m.length === 0) {
      await upsertChatSession("Chat");
    }
    await updateMessages(m, userMessage);
    setInput("");
    setLoading(true);

    try {
      if (input.startsWith("/retrieve")) {
        await updateMessages(m, {
          role: "retrieval",
          params: {
            query: processedInput,
            minTimestamp: getTimestampFromTimeSettings(selectedTimeRange),
          },
        } as ChatMessageType);
        const retrievalResult = await runChatRetrieval(m, {
          query: processedInput,
          minTimestamp: getTimestampFromTimeSettings(selectedTimeRange),
        });
        m.pop();
        await updateMessages(m, retrievalResult);
      } else {
        const result = await runChatAssistant(m, retrievalMode);
        await updateMessages(m, result);
        // has the model decided to run the retrieval function?
        if (result?.role === "retrieval") {
          const params = {
            ...result.params,
            minTimestamp: getTimestampFromTimeSettings(
              selectedTimeRange,
              result.params?.minTimestamp
            ),
          } as { query: string; minTimestamp: number };
          const retrievalResult = await runChatRetrieval(m, params);
          // replace the retrieval message with the result of the retrieval
          // as a consequence, the query is not stored in the database
          m.pop();
          await updateMessages(m, { ...retrievalResult, params });
          const secondResult = await runChatAssistant(m, "none");
          await updateMessages(m, secondResult);
        }
      }
    } catch (e: any) {
      console.log("ERROR", e.message);
      await updateMessages(m, {
        role: "error",
        message: e.message,
      } as ChatMessageType);
    }

    // Update title and save the conversation.
    void (async () => {
      const t = await updateTitle(title, m);
      await upsertChatSession(t);
    })();

    setLoading(false);
  };

  const handleFeedback = (
    message: ChatMessageType,
    feedback: MessageFeedbackStatus
  ) => {
    setMessages((ms) =>
      ms.map((m) => (m.sId === message.sId ? { ...m, feedback: feedback } : m))
    );
    void updateMessageFeedback(message, feedback);
  };

  function isLatest(messageRole: MessageRole, index: number): boolean {
    // returns whether the message is the latest message of the given role
    // in the conversation
    return (
      !(response && response.role === messageRole) &&
      (() => {
        for (let j = messages.length - 1; j >= 0; j--) {
          if (messages[j].role === messageRole) {
            return index === j;
          }
        }
        return false;
      })()
    );
  }

  const { sessions, mutateChatSessions } = useChatSessions(owner, {
    limit: 256,
    offset: 0,
    workspaceScope: false,
  });

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `After deletion, the conversation "${chatSession.title}" cannot be recovered. Delete the conversation?`
    );
    if (confirmed) {
      // call the delete API
      const res = await fetch(
        `/api/w/${owner.sId}/use/chats/${chatSession.sId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cId: chatSession.sId }),
        }
      );
      if (res.ok) {
        void mutateChatSessions();
      } else {
        const data = await res.json();
        window.alert(`Error deleting chat: ${data.error.message}`);
      }
      void handleNew();
    }
    return false;
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistant"
      navChildren={
        <ChatMenu
          owner={owner}
          sessions={sessions}
          onNewConversation={handleNew}
          canStartConversation={canStartConversation}
        />
      }
      titleChildren={
        messages.length > 0 && (
          <AppLayoutTitle
            title={title}
            onDelete={handleDelete}
            // action={{
            //   label: "Share",
            //   labelVisible: true,
            //   icon: ArrowUpOnSquareIcon,
            //   onAction: () => {
            //     console.log("Share!");
            //   },
            // }}
          />
        )
      }
    >
      <div className="flex flex-col pt-4">
        {!canStartConversation && (
          <>
            <PageHeader
              title="Welcome to Assistant"
              icon={ChatBubbleBottomCenterTextIcon}
            />
            <div className="mt-16 rounded-xl border border-structure-200 bg-structure-50 px-8 pb-8 pt-4 drop-shadow-2xl">
              <div className="mb-8 text-lg font-bold">
                Get started with{" "}
                <Logo className="inline-block w-14 pb-1 pl-1"></Logo>
              </div>
              <p className="my-4 text-sm text-element-800">
                <span className="font-bold italic">Assistant</span> can help you
                with a wide range of tasks. It can answer your questions on
                various topics, generic or specific to your company. It is
                particularly good at writing texts and can help you draft and
                edit documents, generate ideas, answer questions.
              </p>
              {owner.role === "admin" ? (
                <>
                  <p className="my-4 text-sm text-element-800">
                    Start by setting up a{" "}
                    <span className="font-bold italic">Data Source</span> to
                    activate Assistant.
                  </p>
                  <div className="pt-4 text-center">
                    <Button
                      type={"primary"}
                      icon={CloudArrowDownIcon}
                      label="Set up your first Data Source"
                      onClick={() => {
                        void router.push(`/w/${owner.sId}/ds`);
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="my-4 text-sm text-element-800">
                    To get started, contact the admin of your workspace to set
                    up a <span className="font-bold italic">Data Source</span>{" "}
                    to activate Assistant.
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {canStartConversation && (
          <>
            <div className="flex-1">
              <div className="-mt-4 pb-32">
                {messages.length > 0 ? (
                  <div>
                    <div className="text-sm">
                      {messages.map((m, i) => {
                        return m.role === "error" ? (
                          <div key={i}>
                            <div className="my-1 ml-10 flex flex-col">
                              <div className="flex-initial text-sm font-bold text-red-500">
                                Oops. An error occured and the team has been
                                notified.
                              </div>
                              <div className="my-1 flex-initial text-sm text-gray-500">
                                You can safely continue the conversation, this
                                error and your last message will be removed from
                                the conversation. Don't hesitate to reach out if
                                the problem persists.
                              </div>
                              <div className="mt-1 flex-initial border-l-4 border-gray-200 pl-2 text-sm italic text-gray-400">
                                {m.message}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div key={i} className="group">
                            <MessageView
                              user={user}
                              message={m}
                              loading={false}
                              // isLatest={
                              //   !response && i === messages.length - 1
                              // }
                              isLatestRetrieval={isLatest("retrieval", i)}
                              readOnly={readOnly}
                              feedback={
                                !readOnly &&
                                m.role === "assistant" && {
                                  handler: handleFeedback,
                                  hover: response
                                    ? true
                                    : i !== messages.length - 1,
                                }
                              }
                            />
                          </div>
                        );
                      })}
                      {response ? (
                        <div key={messages.length}>
                          <MessageView
                            user={user}
                            message={response}
                            loading={true}
                            // isLatest={true}
                            isLatestRetrieval={response.role === "retrieval"}
                            readOnly={readOnly}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <PageHeader
                      title="Welcome to Assistant"
                      icon={ChatBubbleBottomCenterTextIcon}
                    />
                    <div className="mt-16 rounded-xl border border-structure-200 bg-structure-50 px-8 pb-8 pt-4 drop-shadow-2xl">
                      <div className="mb-8 text-lg font-bold">
                        What can I use Assistant for?
                      </div>
                      <p className="my-4 text-sm text-element-800">
                        <span className="font-bold italic">Assistant</span> can
                        help you with a wide range of tasks. It can answer your
                        questions on various topics, generic or specific to your
                        company. It is particularly good at writing texts and
                        can help you draft and edit documents, generate ideas,
                        answer questions.
                      </p>
                      <p className="mt-4 text-center text-sm font-medium text-element-800">
                        Simply start typing to get started with Assistant.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Input fixed panel */}
            {!readOnly && (
              <div className="fixed bottom-0 left-0 right-0 z-20 flex-initial bg-white lg:left-80">
                <div className="mx-auto max-w-4xl px-6">
                  {/* Input bar  */}
                  <div className="">
                    <div className="flex flex-row items-center">
                      <div className="flex flex-1 flex-row items-end items-stretch">
                        <TextareaAutosize
                          minRows={1}
                          placeholder={"Ask a question"}
                          className={classNames(
                            "flex w-full resize-none bg-white text-base ring-0 focus:ring-0",
                            "rounded-sm rounded-xl border-2",
                            "border-action-200 text-element-800 drop-shadow-2xl focus:border-action-300 focus:ring-0",
                            "placeholder-gray-400",
                            "px-3 py-3 pr-8"
                          )}
                          value={input}
                          onChange={(e) => {
                            handleInputUpdate(e.target.value);
                          }}
                          ref={inputRef}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !loading && !e.shiftKey) {
                              void handleSubmit();
                              e.preventDefault();
                            }
                          }}
                          autoFocus={true}
                        />
                        <div className={classNames("z-10 -ml-8 flex flex-col")}>
                          {!loading ? (
                            <PaperAirplaneSolidIcon
                              className="my-auto h-5 w-5 cursor-pointer text-action-500"
                              onClick={() => {
                                void handleSubmit();
                              }}
                            />
                          ) : (
                            <div className="my-auto mb-3.5 ml-1 h-4 w-4">
                              <Spinner />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mb-8 mt-4 flex flex-row flex-wrap items-center text-xs">
                    <div className="flex flex-initial text-gray-400">
                      Data Sources:
                    </div>
                    <div className="flex flex-row">
                      {dataSources.map((ds) => {
                        return (
                          <div
                            key={ds.name}
                            className="group ml-1 flex flex-initial"
                          >
                            <div
                              className={classNames(
                                "z-10 flex h-4 w-4 flex-initial cursor-pointer",
                                ds.provider !== "none" ? "mr-1" : "",
                                ds.selected ? "opacity-100" : "opacity-25"
                              )}
                              onClick={() => {
                                handleSwitchDataSourceSelection(ds.name);
                              }}
                            >
                              {ds.provider !== "none" ? (
                                <img
                                  src={PROVIDER_LOGO_PATH[ds.provider]}
                                ></img>
                              ) : (
                                <DocumentDuplicateIcon className="-ml-0.5 h-4 w-4 text-slate-500" />
                              )}
                            </div>
                            <div className="absolute z-0 hidden rounded group-hover:block">
                              <div className="relative bottom-8 border bg-white px-1 py-1 ">
                                <span className="text-gray-600">
                                  <span className="font-semibold">
                                    {ds.name}
                                  </span>
                                  {ds.description ? ` ${ds.description}` : null}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex hidden flex-1 text-gray-400 sm:block"></div>
                    <div className="flex h-0 basis-full sm:hidden"></div>
                    <div className="mt-2 flex flex-row text-xs sm:mt-0">
                      <TimeRangePicker
                        timeRange={selectedTimeRange}
                        onTimeRangeUpdate={(tr) => handleTimeRangeChange(tr)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
