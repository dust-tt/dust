import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  ArrowRightCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { PulseLogo } from "@app/components/Logo";
import { Spinner } from "@app/components/Spinner";
import TimeRangePicker, {
  ChatTimeRange,
  defaultTimeRange,
} from "@app/components/use/ChatTimeRangePicker";
import MainTab from "@app/components/use/MainTab";
import {
  FeedbackHandler,
  MessageFeedback,
} from "@app/components/use/MessageFeedback";
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
import { DustAPI, DustAPICredentials } from "@app/lib/dust_api";
import { useChatSessions } from "@app/lib/swr";
import { client_side_new_id } from "@app/lib/utils";
import { classNames } from "@app/lib/utils";
import { timeAgoFrom } from "@app/lib/utils";
import {
  ChatMessageType,
  ChatRetrievedDocumentType,
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
  chatSession: {
    sId: string;
    title: string | null;
    messages: ChatMessageType[];
    readOnly: boolean;
  };
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
          sId: cId,
          title: null,
          messages: [],
          readOnly: false,
        },
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
        chatSession: {
          sId: cId,
          title: chatSession.title || null,
          messages: chatSession.messages || [],
          readOnly: user?.id !== chatSession.userId,
        },
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
            href={document.sourceUrl}
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
    <div className="ml-10 flex flex-col">
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
            <div className="loading-dots">
              Computed query: {message.query}. Retrieving docs
            </div>
          )}
        </div>
      </div>
      {expanded && message.retrievals && (
        <div className="ml-4 mt-2 flex flex-col space-y-1">
          {message.retrievals.map((r: ChatRetrievedDocumentType, i: number) => {
            return <DocumentView document={r} key={i} />;
          })}
        </div>
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
          "[&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:pl-4" /* ol */,
          "[&_p]:mb-2" /* p */,
          "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5" /* code */
        )}
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
    <div className="">
      {message.role === "retrieval" ? (
        <div className="flex flex-row">
          <RetrievalsView message={message} isLatest={isLatestRetrieval} />
        </div>
      ) : (
        <div className="my-2 flex flex-row items-start">
          <div
            className={classNames(
              "min-w-6 flex h-8 w-8 flex-initial rounded-md",
              "bg-gray-50"
            )}
          >
            {message.role === "assistant" ? (
              <div className="flex scale-50 pl-2">
                <PulseLogo animated={loading}></PulseLogo>
              </div>
            ) : (
              <div className="flex">
                {!readOnly && user?.image ? (
                  <img
                    className="h-8 w-8 rounded-md"
                    src={user?.image}
                    alt=""
                  />
                ) : (
                  <UserCircleIcon className="mx-1 my-1 h-6 w-6 text-gray-300"></UserCircleIcon>
                )}
              </div>
            )}
          </div>
          <div
            className={classNames(
              "break-word ml-2  flex flex-1 flex-col pt-1",
              message.role === "user" ? "italic text-gray-500" : "text-gray-700"
            )}
          >
            {toMarkdown(message)}
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

function ChatHistory({ owner }: { owner: WorkspaceType }) {
  const router = useRouter();

  const [limit] = useState(10);

  const { sessions } = useChatSessions(owner, limit, 0);

  return (
    <div className="flex w-full flex-col">
      {sessions && sessions.length > 0 && (
        <>
          <div className="mx-auto flex flex-row items-center py-8 font-bold italic">
            Recent Chats
          </div>
          <div className="flex w-full flex-col space-y-2">
            {sessions.map((s, i) => {
              return (
                <div
                  key={i}
                  className="flex w-full cursor-pointer flex-col rounded-md border px-2 py-2 hover:bg-gray-50"
                  onClick={() => {
                    void router.push(`/w/${owner.sId}/u/chat/${s.sId}`);
                  }}
                >
                  <div className="flex flex-row items-center">
                    <div className="flex flex-1">{s.title}</div>
                    <div className="min-w-16 flex flex-initial">
                      <span className="ml-2 text-xs italic text-gray-400">
                        {timeAgoFrom(s.created)} ago
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const COMMANDS: { cmd: string; description: string }[] = [
  {
    cmd: "/new",
    description: "Start a new conversation",
  },
  {
    cmd: "/follow-up",
    description:
      "Forces the assistant to answer *whithout* querying the data sources",
  },
  {
    cmd: "/retrieve",
    description: "Forces the assistant to *only* query the data sources",
  },
];

export default function AppChat({
  user,
  owner,
  workspaceDataSources,
  prodCredentials,
  chatSession,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const prodAPI = new DustAPI(prodCredentials);

  const [title, setTitle] = useState<string>(chatSession.title || "Chat");
  const [smallScreen, setSmallScreen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessageType[]>(
    chatSession.messages || []
  );
  const [titleState, setTitleState] = useState<
    "new" | "writing" | "saving" | "saved"
  >(chatSession.title ? "saved" : "new");

  useEffect(() => {
    setTitle(chatSession.title || "Chat");
    setMessages(chatSession.messages || []);
    setTitleState(chatSession.title ? "saved" : "new");
    inputRef.current?.focus();
  }, [chatSession]);

  const [dataSources, setDataSources] = useState(workspaceDataSources);
  const [selectedTimeRange, setSelectedTimeRange] =
    useState<ChatTimeRange>(defaultTimeRange);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatMessageType | null>(null);
  const [commands, setCommands] = useState<
    { cmd: string; description: string }[]
  >([]);
  const [commandsSelect, setCommandsSelect] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSmallScreen(window.innerWidth < 640);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, response]);

  const handleInputUpdate = (input: string) => {
    setInput(input);
    if (input.startsWith("/") && input.split(" ").length === 1) {
      setCommands(COMMANDS.filter((c) => c.cmd.startsWith(input)));
      setCommandsSelect(0);
    } else {
      setCommands([]);
      setCommandsSelect(0);
    }
  };

  const handleSelectCommand = () => {
    if (commandsSelect >= 0 && commandsSelect < commands.length) {
      if (commands[commandsSelect].cmd === "/new") {
        if (loading) {
          return;
        }
        setCommands([]);
        setCommandsSelect(0);
        return handleNew();
      }
      setInput(commands[commandsSelect].cmd + " ");
      setCommands([]);
      setCommandsSelect(0);
      inputRef.current?.focus();
    }
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

  const runChatRetrieval = async (m: ChatMessageType[], query: string) => {
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
    if (selectedTimeRange.id !== "all") {
      config.DATASOURCE.filter = {
        timestamp: { gt: Date.now() - selectedTimeRange.ms },
      };
    }
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
          query: processedInput,
        } as ChatMessageType);
        const retrievalResult = await runChatRetrieval(m, processedInput);
        m.pop();
        await updateMessages(m, retrievalResult);
      } else {
        const result = await runChatAssistant(m, retrievalMode);
        await updateMessages(m, result);
        // has the model decided to run the retrieval function?
        if (result?.role === "retrieval") {
          const query = result.query as string;
          const retrievalResult = await runChatRetrieval(m, query);
          // replace the retrieval message with the result of the retrieval
          // as a consequence, the query is not stored in the database
          m.pop();
          await updateMessages(m, retrievalResult);
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
      setTitleState("writing");
      const t = await updateTitle(title, m);
      setTitleState("saving");
      const r = await upsertChatSession(t);
      if (r) {
        setTitleState("saved");
      }
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
  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex h-full flex-col">
        <div className="mt-2">
          <MainTab currentTab="Chat" owner={owner} />
        </div>

        {dataSources.length === 0 && (
          <div className="">
            <div className="mx-auto mt-8 max-w-2xl divide-y divide-gray-200 px-6">
              <div className="mt-16 flex flex-col items-center justify-center text-sm text-gray-500">
                <p>💬 Welcome to Chat!</p>
                <p className="mt-8 italic text-violet-700">
                  <span className="font-bold">Chat</span> is a conversational
                  agent with access on your team's knowledge base.
                </p>
                {owner.role === "admin" ? (
                  <p className="mt-8">
                    You need to set up at least one{" "}
                    <Link className="font-bold" href={`/w/${owner.sId}/ds`}>
                      Data Source
                    </Link>{" "}
                    to activate Chat on your workspace.
                  </p>
                ) : (
                  <p className="mt-8">
                    Contact the admin of your workspace to activate Chat for
                    your team.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {dataSources.length > 0 && (
          <>
            <div className="flex-1">
              <div
                className="h-full max-h-full grow-0 overflow-y-auto"
                ref={scrollRef}
              >
                <div className="max-h-0">
                  <div className="mx-auto max-w-4xl px-6 py-2">
                    {messages.length > 0 ? (
                      <div>
                        <div className="mx-auto my-4 flex max-w-xl flex-row items-center justify-center text-sm">
                          <span className="font-bold">{title}</span>
                          <span className="text-xs text-gray-600">
                            {titleState === "new" && (
                              <span className="ml-1 flex items-center rounded bg-gray-200 px-1 py-0.5 text-xs">
                                new
                              </span>
                            )}
                            {titleState === "writing" && (
                              <span className="ml-1 flex items-center rounded bg-gray-200 px-1 py-0.5">
                                writing...
                              </span>
                            )}
                            {titleState === "saving" && (
                              <span className="ml-1 flex items-center rounded bg-gray-200 px-1 py-0.5">
                                <ClockIcon className="mr-0.5 h-3 w-3"></ClockIcon>
                                saving
                              </span>
                            )}
                            {titleState === "saved" && (
                              <span className="ml-1 flex flex-row items-center rounded bg-gray-100 px-1 py-0.5">
                                <CheckCircleIcon className="mr-0.5 h-3 w-3"></CheckCircleIcon>
                                saved
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-sm">
                          {messages.map((m, i) => {
                            return m.role === "error" ? (
                              <div key={i}>
                                <div className="my-2 ml-12 flex flex-col">
                                  <div className="flex-initial text-xs font-bold text-red-500">
                                    Oops! An error occured (and the team has
                                    been notified).
                                  </div>
                                  <div className="flex-initial text-xs text-gray-500">
                                    <ul className="list-inside list-disc">
                                      <li>
                                        You can continue the conversation, this
                                        error and your last message will be
                                        removed from the conversation
                                      </li>
                                      <li>
                                        Alternatively, restart a chat with the
                                        `/new` command or by clicking{" "}
                                        <Link
                                          href={`/w/${owner.sId}/u/chat`}
                                          className="text text-violet-500 hover:underline"
                                        >
                                          here
                                        </Link>
                                      </li>
                                      <li>
                                        Don't hesitate to reach out if the
                                        problem persists.
                                      </li>
                                    </ul>
                                  </div>
                                  <div className="ml-1 flex-initial border-l-4 border-gray-200 pl-1 text-xs italic text-gray-400">
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
                                  readOnly={chatSession.readOnly}
                                  feedback={
                                    !chatSession.readOnly &&
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
                                isLatestRetrieval={
                                  response.role === "retrieval"
                                }
                                readOnly={chatSession.readOnly}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="mx-auto mt-8 flex max-w-xl flex-col items-center justify-center text-sm text-gray-500">
                        <p>💬 Welcome to Chat!</p>
                        <p className="mt-8">
                          👩🏼‍🔬 This is an early exploration of a conversational
                          assistant with context on your team's Slack & Notion.
                          For each interaction, semantically relevant chunks of
                          documents are retrieved and presented to Chat to help
                          it answer your queries.
                        </p>
                        <p className="mt-4">
                          📈 You should expect better performance on general,
                          qualitative, and thematic questions. Precise or
                          quantitative questions won't work as well.
                        </p>
                        <p className="mt-4">
                          🔗 You can presume the last few answers are in context
                          for your dialogue with Chat: don't hesitate to ask
                          follow-up questions. Only the latest documents
                          retrieved are visible to Chat. Context is limited so
                          don't be surprised if Chat moves on after a while.
                        </p>
                        <p className="mt-4">
                          🧞‍♂️ Please share feedback with us on what's working
                          well and what else you would like Chat to do via Slack
                          or email:{" "}
                          <a href="mailto:team@dust.tt" className="font-bold">
                            team@dust.tt
                          </a>
                        </p>
                        <div className="mt-8 w-full">
                          ⚙️ Available commands:
                          <div className="pt-2">
                            {COMMANDS.map((c, i) => {
                              return (
                                <div
                                  key={i}
                                  className={classNames("flex px-2 py-1")}
                                >
                                  <div className="flex w-24 flex-row">
                                    <div className="flex flex-initial flex-col">
                                      <div
                                        className={classNames(
                                          "flex flex-initial",
                                          "rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-slate-800"
                                        )}
                                      >
                                        {c.cmd}
                                      </div>
                                      <div className="flex flex-1"></div>
                                    </div>
                                    <div className="flex flex-1"></div>
                                  </div>
                                  <div className="ml-2 w-64 sm:w-max">
                                    {c.description}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="w-full py-4">
                          <ChatHistory owner={owner} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {!chatSession.readOnly && (
              <div className="z-50 w-full flex-initial border bg-white text-sm">
                <div className="mx-auto mt-8 max-w-2xl px-6 xl:max-w-4xl xl:px-12">
                  <div className="mb-1 mt-2">
                    <div className="flex flex-row items-center">
                      <div className="-ml-14 mr-2 hidden rounded-lg bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 md:block">
                        alpha
                      </div>
                      <div className="flex flex-1 flex-row items-end">
                        {commands.length > 0 && (
                          <div className="absolute mb-12 pr-7">
                            <div className="flex flex-col rounded-sm border bg-white px-2 py-2">
                              {commands.map((c, i) => {
                                return (
                                  <div
                                    key={i}
                                    className={classNames(
                                      "flex cursor-pointer flex-row rounded-sm px-2 py-2",
                                      i === commandsSelect
                                        ? "bg-gray-100"
                                        : "bg-white"
                                    )}
                                    onMouseEnter={() => {
                                      setCommandsSelect(i);
                                    }}
                                    onClick={() => {
                                      void handleSelectCommand();
                                    }}
                                  >
                                    <div className="flex w-24 flex-row">
                                      <div
                                        className={classNames(
                                          "flex flex-initial",
                                          "rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-slate-800"
                                        )}
                                      >
                                        {c.cmd}
                                      </div>
                                      <div className="flex flex-1"></div>
                                    </div>
                                    <div className="ml-2 w-48 truncate pr-2 italic text-gray-500 sm:w-max">
                                      {c.description}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <TextareaAutosize
                          minRows={1}
                          placeholder={
                            (smallScreen
                              ? ""
                              : `Ask anything about \`${owner.name}\`.`) +
                            "Press ⏎ to submit, shift+⏎ for next line"
                          }
                          className={classNames(
                            "block w-full resize-none bg-slate-50 px-2 py-2 text-[13px] font-normal ring-0 focus:ring-0",
                            "rounded-sm",
                            "border",
                            "border-slate-200 focus:border-slate-300 focus:ring-0",
                            "placeholder-gray-400",
                            "pr-7"
                          )}
                          value={input}
                          onChange={(e) => {
                            handleInputUpdate(e.target.value);
                          }}
                          ref={inputRef}
                          onKeyDown={(e) => {
                            if (commands.length > 0) {
                              if (e.key === "ArrowUp") {
                                setCommandsSelect(
                                  commandsSelect > 0
                                    ? commandsSelect - 1
                                    : commandsSelect
                                );
                                e.preventDefault();
                              }
                              if (e.key === "ArrowDown") {
                                setCommandsSelect(
                                  commandsSelect < commands.length - 1
                                    ? commandsSelect + 1
                                    : commandsSelect
                                );
                                e.preventDefault();
                              }
                              if (e.key === "Enter") {
                                void handleSelectCommand();
                                e.preventDefault();
                              }
                            } else if (
                              e.key === "Enter" &&
                              !loading &&
                              !e.shiftKey
                            ) {
                              void handleSubmit();
                              e.preventDefault();
                            }
                          }}
                          autoFocus={true}
                        />
                        <div
                          className={classNames(
                            "-ml-7 mb-2 flex-initial pb-0.5 font-normal"
                          )}
                        >
                          {!loading ? (
                            <ArrowRightCircleIcon
                              className="h-5 w-5 cursor-pointer text-violet-500"
                              onClick={() => {
                                void handleSubmit();
                              }}
                            />
                          ) : (
                            <div className="mb-1 ml-1">
                              <Spinner />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-row flex-wrap items-center text-xs">
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
