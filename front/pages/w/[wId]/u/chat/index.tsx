import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  ArrowRightCircleIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { PulseLogo } from "@app/components/Logo";
import { Spinner } from "@app/components/Spinner";
import MainTab from "@app/components/use/MainTab";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions_registry";
import {
  Authenticator,
  getSession,
  getUserFromSession,
  prodAPICredentialsForOwner,
} from "@app/lib/auth";
import { ConnectorProvider } from "@app/lib/connectors_api";
import {
  DustAPI,
  DustAPICredentials,
  runActionStreamed,
} from "@app/lib/dust_api";
import { classNames } from "@app/lib/utils";
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

  return {
    props: {
      user,
      owner,
      workspaceDataSources: dataSources,
      prodCredentials,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

type RetrievedDocument = {
  data_source_id: string;
  source_url: string;
  document_id: string;
  timestamp: string;
  tags: string[];
  score: number;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
};

type Message = {
  role: "user" | "retrieval" | "assistant" | "error";
  runRetrieval?: boolean;
  runAssistant?: boolean;
  message?: string; // for `user`, `assistant` and `error` messages
  retrievals?: RetrievedDocument[]; // for `retrieval` messages
};

const providerFromDocument = (document: RetrievedDocument) => {
  let provider = "none";
  switch (document.data_source_id) {
    case "managed-slack":
      provider = "slack";
      break;
    case "managed-notion":
      provider = "notion";
      break;
  }
  return provider;
};

const titleFromDocument = (document: RetrievedDocument) => {
  let title = document.document_id;
  // Try to look for a title tag.
  for (const tag of document.tags) {
    if (tag.startsWith("title:")) {
      title = tag.substring("title:".length);
    }
  }

  switch (document.data_source_id) {
    case "managed-slack":
      for (const tag of document.tags) {
        if (tag.startsWith("channelName:")) {
          title = "#" + tag.substring("channelName:".length);
        }
      }
      break;
  }
  return title;
};

export function DocumentView({ document }: { document: RetrievedDocument }) {
  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);
  const [chunkExpanded, setChunkExpanded] = useState(false);

  const provider = providerFromDocument(document);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center text-xs">
        <div
          className={classNames(
            "flex flex-initial cursor-pointer select-none rounded-md bg-gray-100 px-1 py-0.5",
            chunkExpanded ? "bg-gray-300" : "hover:bg-gray-200"
          )}
          onClick={() => {
            setChunkExpanded(!chunkExpanded);
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
            href={document.source_url}
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
  message: Message;
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
      message.retrievals.forEach((r) => {
        const provider = providerFromDocument(r);
        if (r.data_source_id in summary) {
          summary[r.data_source_id].count += 1;
        } else {
          summary[r.data_source_id] = {
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
          {!message.retrievals && <div className="">Loading...</div>}
        </div>
      </div>
      {expanded && message.retrievals && (
        <div className="ml-4 mt-2 flex flex-col space-y-1">
          {message.retrievals.map((r, i) => {
            return <DocumentView document={r} key={i} />;
          })}
        </div>
      )}
    </div>
  ) : null;
}

export function MessageView({
  user,
  message,
  loading,
  isLatestRetrieval,
}: {
  user: UserType | null;
  message: Message;
  loading: boolean;
  isLatestRetrieval: boolean;
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
              message.role === "assistant" ? "bg-gray-50" : "bg-gray-0"
            )}
          >
            {message.role === "assistant" ? (
              <div className="flex scale-50 pl-2">
                <PulseLogo animated={loading}></PulseLogo>
              </div>
            ) : (
              <div className="flex">
                <img
                  className="h-8 w-8 rounded-md"
                  src={user?.image || "https://gravatar.com/avatar/anonymous"}
                  alt=""
                />
              </div>
            )}
          </div>
          <div
            className={classNames(
              "ml-2 mt-1 flex flex-1 flex-col whitespace-pre-wrap",
              message.role === "user" ? "italic text-gray-500" : "text-gray-700"
            )}
          >
            {message.message}
          </div>
        </div>
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
      "Follow-up with the assistant without performing a document retrieval",
  },
  {
    cmd: "/retrieve",
    description: "Perform a document retrieval without querying the assistant",
  },
];

export default function AppChat({
  user,
  owner,
  workspaceDataSources,
  prodCredentials,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const isMac =
    typeof window !== "undefined"
      ? navigator.platform.toUpperCase().indexOf("MAC") >= 0
      : false;

  const prodAPI = new DustAPI(prodCredentials);

  const [messages, setMessages] = useState<Message[]>([]);
  const [dataSources, setDataSources] = useState(workspaceDataSources);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Message | null>(null);
  const [commands, setCommands] = useState<
    { cmd: string; description: string }[]
  >([]);
  const [commandsSelect, setCommandsSelect] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
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

  const handleNew = async () => {
    setMessages([]);
    setInput("");
    setLoading(false);
  };

  const handleSubmit = async () => {
    let runRetrieval = true;
    let runAssistant = true;
    let processedInput = input;

    if (input.startsWith("/retrieve")) {
      runAssistant = false;
      processedInput = input.substring("/retrieve".length).trim();
    }
    if (input.startsWith("/follow-up")) {
      runRetrieval = false;
      processedInput = input.substring("/follow-up".length).trim();
    }

    // clone messages add new message to the end
    const m = [...messages];
    const userMessage: Message = {
      role: "user",
      runRetrieval,
      runAssistant,
      message: processedInput,
    };

    m.push(userMessage);
    setMessages(m);
    setInput("");
    setLoading(true);

    if (runRetrieval) {
      const retrievalMessage: Message = {
        role: "retrieval",
      };
      setResponse(retrievalMessage);

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

      const res = await runActionStreamed(owner, "chat-retrieval", config, [
        { messages: [userMessage] },
      ]);
      if (res.isErr()) {
        m.push({
          role: "error",
          message: res.error.message,
        } as Message);
        // console.log("ERROR", res.error);
        setMessages(m);
        setResponse(null);
        setLoading(false);
        return;
      }

      const { eventStream } = res.value;

      for await (const event of eventStream) {
        // console.log("EVENT", event);
        if (event.type === "error") {
          console.log("ERROR event", event);
          m.push({
            role: "error",
            message: event.content.message,
          } as Message);
          setMessages(m);
          setResponse(null);
          setLoading(false);
          return;
        }
        if (event.type === "block_execution") {
          const e = event.content.execution[0][0];
          if (event.content.block_name === "DATASOURCE") {
            if (e.error) {
              m.push({
                role: "error",
                message: e.error,
              } as Message);
              setMessages(m);
              setResponse(null);
              setLoading(false);
              return;
            }
          }
          if (event.content.block_name === "OUTPUT") {
            if (!e.error) {
              m.push(e.value);
              setMessages(m);
              setResponse(null);
            }
          }
        }
      }
    }

    if (runAssistant) {
      const assistantMessage: Message = {
        role: "assistant",
        message: "",
      };
      setResponse(assistantMessage);

      const config = cloneBaseConfig(
        DustProdActionRegistry["chat-assistant"].config
      );

      const context = {
        user: {
          username: user?.username,
          full_name: user?.name,
        },
        workspace: owner.name,
        date_today: new Date().toISOString().split("T")[0],
      };

      const res = await runActionStreamed(owner, "chat-assistant", config, [
        { messages: m, context },
      ]);
      if (res.isErr()) {
        m.push({
          role: "error",
          message: res.error.message,
        } as Message);
        // console.log("ERROR", res.error);
        setMessages(m);
        setResponse(null);
        setLoading(false);
        return;
      }

      const { eventStream } = res.value;

      for await (const event of eventStream) {
        // console.log("EVENT", event);
        if (event.type === "tokens") {
          const message = assistantMessage.message + event.content.tokens.text;
          setResponse({ ...assistantMessage, message: message });
          assistantMessage.message = message;
        }
        if (event.type === "error") {
          console.log("ERROR event", event);
          m.push({
            role: "error",
            message: event.content.message,
          } as Message);
          setMessages(m);
          setResponse(null);
          setLoading(false);
          return;
        }
        if (event.type === "block_execution") {
          const e = event.content.execution[0][0];
          if (event.content.block_name === "MODEL") {
            if (e.error) {
              m.push({
                role: "error",
                message: e.error,
              } as Message);
              setMessages(m);
              setResponse(null);
              setLoading(false);
              return;
            }
          }
          if (event.content.block_name === "OUTPUT") {
            if (!e.error) {
              m.push(e.value);
              setMessages(m);
              setResponse(null);
            }
          }
        }
      }
    }

    setLoading(false);
  };

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
                      <div className="text-sm">
                        {messages.map((m, i) => {
                          return m.role === "error" ? (
                            <div key={i}>
                              <div className="my-2 ml-12 flex flex-col">
                                <div className="flex-initial text-xs font-bold text-red-500">
                                  Oops! An error occured (and the team has been
                                  notified).
                                </div>
                                <div className="flex-initial text-xs text-gray-500">
                                  Please give it another try, and don't hesitate
                                  to reach out if the problem persists.
                                </div>
                                <div className="ml-1 flex-initial border-l-4 border-gray-200 pl-1 text-xs italic text-gray-400">
                                  {m.message}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div key={i}>
                              <MessageView
                                user={user}
                                message={m}
                                loading={false}
                                // isLatest={
                                //   !response && i === messages.length - 1
                                // }
                                isLatestRetrieval={
                                  !(
                                    response && response.role === "retrieval"
                                  ) &&
                                  (() => {
                                    for (
                                      let j = messages.length - 1;
                                      j >= 0;
                                      j--
                                    ) {
                                      if (messages[j].role === "retrieval") {
                                        return i === j;
                                      }
                                    }
                                    return false;
                                  })()
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
                            />
                          </div>
                        ) : null}
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
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="z-50 w-full flex-initial border bg-white text-sm">
              <div className="mx-auto mt-8 max-w-2xl px-6 xl:max-w-4xl xl:px-12">
                <div className="my-2">
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
                        placeholder={`Ask anything about \`${owner.name}\``}
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
                          }
                          if (e.ctrlKey || e.metaKey) {
                            if (e.key === "Enter" && !loading) {
                              void handleSubmit();
                              e.preventDefault();
                            }
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
                <div className="mb-4 flex flex-row text-xs">
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
                              "mr-1 flex h-4 w-4 flex-initial cursor-pointer",
                              ds.selected ? "opacity-100" : "opacity-25"
                            )}
                            onClick={() => {
                              handleSwitchDataSourceSelection(ds.name);
                            }}
                          >
                            {ds.provider !== "none" ? (
                              <img src={PROVIDER_LOGO_PATH[ds.provider]}></img>
                            ) : (
                              <DocumentDuplicateIcon className="h-4 w-4 text-slate-500" />
                            )}
                          </div>
                          <div className="absolute bottom-10 hidden rounded border bg-white px-1 py-1 group-hover:block">
                            <span className="text-gray-600">
                              <span className="font-semibold">{ds.name}</span>
                              {ds.description ? ` ${ds.description}`: null}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-1 text-gray-400"></div>
                  <div className="flex flex-initial text-gray-400">
                    <>
                      <span className="font-bold">
                        {isMac ? "⌘" : "ctrl"}
                        +⏎
                      </span>
                      <span className="ml-1 text-gray-300">to submit</span>
                    </>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
