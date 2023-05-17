import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
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
};

type ManagedDataSource = {
  name: string;
  provider: ConnectorProvider;
  selected: boolean;
  logoPath: string;
};

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  managedDataSources: ManagedDataSource[];
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

  const dataSources = dsRes.value;

  const managedDataSources = dataSources
    .filter((ds) => ds.connectorProvider)
    .map((ds) => {
      if (!ds.connectorProvider) {
        throw new Error("provider not defined for the data source");
      }
      return {
        name: ds.name,
        provider: ds.connectorProvider,
        selected: true,
        logoPath: PROVIDER_LOGO_PATH[ds.connectorProvider],
      };
    });

  managedDataSources.sort((a, b) => {
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
      managedDataSources,
      prodCredentials,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

type RetrievedDocument = {
  sourceUrl: string;
  title: string;
  provider: ConnectorProvider;
  score: number;
  document: {
    channelName?: string;
    timestamp: string;
    title?: string;
    lastEditedAt?: string;
    chunks: {
      text: string;
      offset: number;
    }[];
  };
};

type Message = {
  role: "user" | "assistant";
  content: string;
  retrievals: RetrievedDocument[] | null;
};

type ErrorMessage = {
  message: string;
};

function isErrorMessage(m: Message | ErrorMessage): m is ErrorMessage {
  return (m as ErrorMessage).message !== undefined;
}

export function RetrievalsView({
  message,
  isLatest,
}: {
  message: Message;
  isLatest: boolean;
}) {
  const [summary, setSummary] = useState<{ [provider: string]: number }>({});
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (message.retrievals && message.retrievals.length > 0) {
      const summary = {} as { [key: string]: number };
      message.retrievals.forEach((r) => {
        if (r.provider in summary) {
          summary[r.provider] += 1;
        } else {
          summary[r.provider] = 1;
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
                      <img src={PROVIDER_LOGO_PATH[k]}></img>
                    </div>
                    <div className="flex-initial text-gray-700">
                      {summary[k]}
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
            return (
              <div key={i} className="flex flex-row items-center text-xs">
                <div className="flex flex-initial rounded-md bg-gray-100 px-1 py-0.5">
                  {r.score.toFixed(2)}
                </div>
                <div className="ml-2 flex flex-initial">
                  <div className={classNames("mr-1 flex h-4 w-4")}>
                    <img src={PROVIDER_LOGO_PATH[r.provider]}></img>
                  </div>
                </div>
                {r.provider === "slack" && (
                  <div className="flex flex-initial">
                    <a
                      href={r.sourceUrl}
                      target={"_blank"}
                      className="font-bold text-gray-600"
                    >
                      #{r.document.channelName}
                    </a>
                    <span className="ml-1 text-gray-400">
                      {r.document.timestamp.split(" ")[0]}
                    </span>
                  </div>
                )}
                {r.provider === "notion" && (
                  <div className="flex flex-initial">
                    <a
                      href={r.sourceUrl}
                      target={"_blank"}
                      className="text-gray-600"
                    >
                      {r.document.title}
                    </a>
                    <span className="ml-1 text-gray-400">
                      {r.document.timestamp.split(" ")[0]}
                    </span>
                  </div>
                )}
              </div>
            );
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
  isLatest,
}: {
  user: UserType | null;
  message: Message;
  loading: boolean;
  isLatest: boolean;
}) {
  return (
    <div className="">
      <div className="flex flex-row">
        {message.role === "assistant" && (
          <RetrievalsView message={message} isLatest={isLatest} />
        )}
      </div>
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
          {message.content}
        </div>
      </div>
    </div>
  );
}

export default function AppChat({
  user,
  owner,
  managedDataSources,
  prodCredentials,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const isMac =
    typeof window !== "undefined"
      ? navigator.platform.toUpperCase().indexOf("MAC") >= 0
      : false;

  const prodAPI = new DustAPI(prodCredentials);

  const [messages, setMessages] = useState<(Message | ErrorMessage)[]>([]);
  const [dataSources, setDataSources] = useState(managedDataSources);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Message | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, response]);

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

  const handleSubmitMessage = async () => {
    // clone messages add new message to the end
    const m = [...messages];
    m.push({
      role: "user",
      content: input,
      retrievals: [],
    });
    setMessages(m);
    setInput("");
    setLoading(true);
    const r: Message = {
      role: "assistant",
      content: "",
      retrievals: null,
    };
    setResponse(r);

    const config = cloneBaseConfig(DustProdActionRegistry["chat-main"].config);
    config.DATASOURCE.data_sources = dataSources
      .filter((ds) => ds.selected)
      .map((ds) => {
        return {
          workspace_id: prodAPI.workspaceId(),
          data_source_id: ds.name,
        };
      });

    const res = await runActionStreamed(owner, "chat-main", config, [
      { messages: m },
    ]);
    if (res.isErr()) {
      console.log("ERROR", res.error);
      // TODO(spolu): error reporting
      setLoading(false);
      return;
    }
    const { eventStream } = res.value;

    let skip = false;
    for await (const event of eventStream) {
      if (skip) continue;
      // console.log("EVENT", event);
      if (event.type === "tokens") {
        const content = r.content + event.content.tokens.text;
        setResponse({ ...r, content });
        r.content = content;
      }
      if (event.type === "error") {
        console.log("ERROR event", event);
        m.push({
          message: event.content.message,
        } as ErrorMessage);
        setMessages(m);
        setResponse(null);
        skip = true;
      }
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "RETRIEVALS") {
          if (!e.error) {
            r.retrievals = e.value;
            setResponse({ ...r });
          }
        }
        if (event.content.block_name === "MODEL") {
          if (e.error) {
            console.log("MODEL event wiht error", event);
            m.push({
              message: e.error,
            } as ErrorMessage);
            setMessages(m);
            setResponse(null);
            skip = true;
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

    setLoading(false);
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex h-full flex-col">
        <div className="mt-2">
          <MainTab currentTab="Chat" owner={owner} />
        </div>
        <div className="flex-1">
          <div
            className="h-full max-h-full grow-0 overflow-y-auto"
            ref={scrollRef}
          >
            <div className="max-h-0">
              <div className="mx-auto max-w-2xl px-6 py-2">
                {messages.length > 0 ? (
                  <div className="text-sm">
                    {messages.map((m, i) => {
                      return isErrorMessage(m) ? (
                        <div key={i}>
                          <div className="my-2 ml-12 flex flex-col">
                            <div className="flex-initial text-xs font-bold text-red-500">
                              Oops! An error occured (and the team has been
                              notified).
                            </div>
                            <div className="flex-initial text-xs text-gray-500">
                              Please give it another try, and don't hesitate to
                              reach out if the problem persists.
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
                            isLatest={!response && i === messages.length - 1}
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
                          isLatest={true}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-8 flex max-w-xl flex-col items-center justify-center text-sm text-gray-500">
                    <p>💬 Welcome to Chat!</p>
                    <p className="mt-8">
                      👩🏼‍🔬 This is an early exploration of a conversational
                      assistant with context on your team's Slack & Notion. For
                      each interaction, semantically relevant chunks of
                      documents are retrieved and presented to Chat to help it
                      answer your queries.
                    </p>
                    <p className="mt-4">
                      📈 You should expect better performance on general,
                      qualitative, and thematic questions. Precise or
                      quantitative questions won't work as well.
                    </p>
                    <p className="mt-4">
                      🔗 You can presume the last few answers are in context for
                      your dialogue with Chat: don't hesitate to ask follow-up
                      questions. Only the latest documents retrieved are visible
                      to Chat. Context is limited so don't be surprised if Chat
                      moves on after a while.
                    </p>
                    <p className="mt-4">
                      🧞‍♂️ Please share feedback with us on what's working well
                      and what else you would like Chat to do via Slack or
                      email:{" "}
                      <a href="mailto:team@dust.tt" className="font-bold">
                        team@dust.tt
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="z-50 w-full flex-initial border bg-white text-sm">
          <div className="mx-auto mt-8 max-w-2xl px-6">
            <div className="my-2">
              <div className="flex flex-row items-center">
                <div className="-ml-14 mr-2 hidden rounded-lg bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 md:block">
                  alpha
                </div>
                <div className="flex flex-1 flex-row items-end">
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
                      setInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (e.key === "Enter" && !loading) {
                          void handleSubmitMessage();
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
                          void handleSubmitMessage();
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
                    <div key={ds.name} className="ml-1 flex flex-initial">
                      <div
                        className={classNames(
                          "mr-1 flex h-4 w-4 flex-initial cursor-pointer",
                          ds.selected ? "opacity-100" : "opacity-25"
                        )}
                        onClick={() => {
                          handleSwitchDataSourceSelection(ds.name);
                        }}
                      >
                        <img src={ds.logoPath}></img>
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
      </div>
    </AppLayout>
  );
}
