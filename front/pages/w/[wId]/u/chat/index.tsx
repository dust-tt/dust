import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";
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

const PROVIDER_LOGO_PATH = {
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
      return {
        name: ds.name,
        provider: ds.connectorProvider!,
        selected: true,
        logoPath: PROVIDER_LOGO_PATH[ds.connectorProvider!],
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
};

type Message = {
  role: "user" | "assistant";
  content: string;
  retrievals: RetrievedDocument[];
};

export function MessageView({
  user,
  message,
  loading,
}: {
  user: UserType | null;
  message: Message;
  loading: boolean;
}) {
  return (
    <div className="">
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [dataSources, setDataSources] = useState(managedDataSources);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Message | null>(null);

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
      retrievals: [],
    };
    setResponse(r);

    const config = cloneBaseConfig(DustProdActionRegistry["chat-main"].config);
    config.DATASOURCE.data_sources = managedDataSources
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
    for await (const event of eventStream) {
      // console.log("EVENT", event);
      if (event.type === "tokens") {
        const content = r.content + event.content.tokens.text;
        setResponse({ ...r, content });
        r.content = content;
      }
      if (event.type === "error") {
        // TODO(spolu): error reporting
        console.log("ERROR event", event);
      }
    }

    m.push(r);
    setMessages(m);
    setResponse(null);
    setLoading(false);
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Chat" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-2xl px-6">
            <div className="text-sm">
              {messages.map((m, i) => {
                return (
                  <div key={i}>
                    <MessageView
                      user={user}
                      message={m}
                      loading={false}
                    ></MessageView>
                  </div>
                );
              })}
              {response ? (
                <div key={messages.length}>
                  <MessageView
                    user={user}
                    message={response}
                    loading={true}
                  ></MessageView>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 z-50 w-full border text-sm">
          <div className="mx-auto mt-8 max-w-2xl px-6">
            <div className="my-2">
              <TextareaAutosize
                minRows={1}
                placeholder={`Ask anything about ${owner.name}...`}
                className={classNames(
                  "block w-full resize-none rounded-sm bg-slate-50 px-2 py-2 text-[13px] font-normal ring-0 focus:ring-0",
                  "border-slate-200 focus:border-slate-300 focus:ring-0"
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
              />
            </div>
            <div className="mb-4 flex flex-row text-xs">
              <div className="flex flex-initial text-gray-400">
                data sources:
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
                {loading ? (
                  <div className="mr-1">
                    <Spinner />
                  </div>
                ) : (
                  <>
                    <span className="font-bold">
                      {isMac ? "⌘" : "ctrl"}
                      +⏎
                    </span>
                    <span className="ml-1 text-gray-300">to submit</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
