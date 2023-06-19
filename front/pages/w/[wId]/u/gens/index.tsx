import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { ActionButton } from "@app/components/Button";
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
import {
  DustAPI,
  DustAPICredentials,
  runActionStreamed,
} from "@app/lib/dust_api";
import { classNames } from "@app/lib/utils";
import { GensRetrievedDocumentType } from "@app/types/gens";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

const PROVIDER_LOGO_PATH: { [provider: string]: string } = {
  notion: "/static/notion_32x32.png",
  slack: "/static/slack_32x32.png",
  google_drive: "/static/google_drive_32x32.png",
  github: "/static/github_black_32x32.png",
};

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  prodCredentials: DustAPICredentials;
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
  // const prodAPI = new DustAPI(prodCredentials);
  //
  // const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  // if (dsRes.isErr()) {
  //   return {
  //     notFound: true,
  //   };
  // }

  return {
    props: {
      user,
      owner,
      prodCredentials,
      readOnly: false,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

const providerFromDocument = (document: GensRetrievedDocumentType) => {
  let provider = "none";
  switch (document.dataSourceId) {
    case "managed-slack":
      provider = "slack";
      break;
    case "managed-notion":
      provider = "notion";
      break;
    case "managed-google_drive":
      provider = "google_drive";
      break;
    case "managed-github":
      provider = "github";
      break;
  }
  return provider;
};

const titleFromDocument = (document: GensRetrievedDocumentType) => {
  let title = document.documentId;
  // Try to look for a title tag.
  for (const tag of document.tags) {
    if (tag.startsWith("title:")) {
      title = tag.substring("title:".length);
    }
  }

  switch (document.dataSourceId) {
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

export class FunctionSingleArgParser {
  _textSoFar: string;
  _inArg: boolean;
  _functionCall: string;
  _handler: (token: string) => void;

  constructor(functionCall: string, handler: (token: string) => void) {
    this._functionCall = functionCall;
    this._textSoFar = "";
    this._inArg = false;
    this._handler = handler;
  }

  feed(token: string): void {
    this._textSoFar += token;
  }
}

export function DocumentView({
  document,
}: {
  document: GensRetrievedDocumentType;
}) {
  const provider = providerFromDocument(document);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center text-xs">
        <div
          className={classNames(
            "flex flex-initial select-none rounded-md bg-gray-100 bg-gray-300 px-1 py-0.5",
            document.chunks.length > 0 ? "cursor-pointer" : ""
          )}
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
      <div className="my-2 flex flex-col space-y-2">
        {document.chunks.map((chunk, i) => (
          <div key={i} className="flex flex-initial">
            <div className="ml-10 border-l-4 border-slate-400">
              <p
                className={classNames(
                  "cursor-pointer pl-2 text-xs italic text-gray-500"
                )}
              >
                {chunk.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppGens({
  user,
  owner,
  prodCredentials,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const prodAPI = new DustAPI(prodCredentials);

  const [genContent, setGenContent] = useState<string>("");
  const [genCursorPosition, setGenCursorPosition] = useState<number>(0);
  const genTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [timRange, setTimeRange] = useState<string | null>(null);

  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrieved, setRetrieved] = useState([]);

  const [generateLoading, setGenerateLoading] = useState<boolean>(false);

  const getContext = () => {
    return {
      user: {
        username: user?.username,
        full_name: user?.name,
      },
      workspace: owner.name,
      date_today: new Date().toISOString().split("T")[0],
    };
  };

  const handleGenChange = (value: string) => {
    setGenContent(value);
  };

  const handleRefreshQuery = async () => {
    setQueryLoading(true);

    const config = cloneBaseConfig(DustProdActionRegistry["gens-query"].config);
    const inputs = [{ text: genContent, context: getContext() }];

    const res = await runActionStreamed(owner, "gens-query", config, inputs);
    if (res.isErr()) {
      setQueryLoading(false);
      setTimeRange(null);
      return;
    }

    const { eventStream } = res.value;

    for await (const event of eventStream) {
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            setTimeRange(e.value.time_range);
          }
        }
      }
    }

    setQueryLoading(false);
  };

  const handleGenerate = async () => {
    setGenerateLoading(true);

    const config = cloneBaseConfig(
      DustProdActionRegistry["gens-generate"].config
    );

    // insert <CURSOR> at genCursorPosition
    let content = genContent;
    let cursorPosition = genCursorPosition;

    const textWithCursor = `${content.slice(
      0,
      cursorPosition
    )}<CURSOR>${content.slice(cursorPosition)}`;

    console.log(textWithCursor);

    const inputs = [
      { text_with_cursor: textWithCursor, context: getContext() },
    ];

    const res = await runActionStreamed(owner, "gens-generate", config, inputs);
    if (res.isErr()) {
      console.log("ERROR", res.error);
      setGenerateLoading(false);
      return;
    }

    const { eventStream } = res.value;
    let tokensSoFar = "";

    for await (const event of eventStream) {
      if (event.type === "function_call_arguments_tokens") {
        const tokens = event.content.tokens.text;
        console.log("FN TOKENS event", tokens);

        if (tokensSoFar.includes('"sentence": ')) {
          content = `${content.slice(
            0,
            cursorPosition
          )}${tokens}${content.slice(cursorPosition)}`;
          cursorPosition += tokens.length;

          setGenContent(content);
          setGenCursorPosition(cursorPosition);
        }

        tokensSoFar += tokens;
      }
      if (event.type === "error") {
        console.log("ERROR error event", event);
        setGenerateLoading(false);
        return;
      }
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "MODEL") {
          if (e.error) {
            console.log("ERROR block_execution event", e.error);
            setGenerateLoading(false);
            return;
          }
        }
      }
    }

    setGenerateLoading(false);
  };

  const handleSearch = async () => {
    setRetrievalLoading(true);
    const userContext = {
      user: {
        username: user?.username,
        full_name: user?.name,
      },
      workspace: owner.name,
      date_today: new Date().toISOString().split("T")[0],
    };
    const config = cloneBaseConfig(
      DustProdActionRegistry["gens-retrieval"].config
    );
    config.DATASOURCE.data_sources = [
      {
        workspace_id: prodAPI.workspaceId(),
        data_source_id: "managed-notion",
      },
    ];
    const res = await runActionStreamed(owner, "gens-retrieval", config, [
      { text: genContent, userContext },
    ]);
    if (res.isErr()) {
      window.alert("Error runing `gens-retrieval`: " + res.error);
      return;
    }

    const { eventStream } = res.value;

    for await (const event of eventStream) {
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "OUTPUT") {
          console.log(e.value);
          setRetrieved(e.value.retrievals);
          setRetrievalLoading(false);
          if (!e.error) {
            console.log("Search results", e.value);
          }
        }
      }
    }
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Gens" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl divide-y px-6">
            <div className="flex flex-col">
              <div className="flex flex-col space-y-4 text-sm font-medium leading-8 text-gray-700">
                <div className="flex w-full font-normal">
                  <TextareaAutosize
                    minRows={8}
                    ref={genTextAreaRef}
                    className={classNames(
                      "block w-full resize-none rounded-md bg-slate-100 px-2 py-1 font-mono text-[13px] font-normal",
                      readOnly
                        ? "border-gray-200 ring-0 focus:border-white focus:ring-0"
                        : "border-gray-200 focus:border-gray-300 focus:ring-0"
                    )}
                    readOnly={readOnly}
                    value={genContent}
                    onChange={(e) => {
                      setGenCursorPosition(e.target.selectionStart);
                      handleGenChange(e.target.value);
                    }}
                    onBlur={(e) => {
                      setGenCursorPosition(e.target.selectionStart);
                    }}
                  />
                </div>
                <div className="flex-rows flex space-x-2">
                  <div className="flex flex-initial">
                    <ActionButton
                      disabled={queryLoading}
                      onClick={() => {
                        void handleRefreshQuery();
                      }}
                    >
                      {queryLoading ? "Loading..." : "Refresh Query"}
                    </ActionButton>
                  </div>
                  <div className="flex flex-initial">
                    <ActionButton
                      disabled={retrievalLoading}
                      onClick={() => {
                        void handleSearch();
                      }}
                    >
                      {retrievalLoading ? "Loading..." : "Run Search"}
                    </ActionButton>
                  </div>
                  <div className="flex flex-initial">
                    <ActionButton
                      disabled={generateLoading}
                      onClick={() => {
                        void handleGenerate();
                      }}
                    >
                      {generateLoading ? "Loading..." : "Generate"}
                    </ActionButton>
                  </div>
                </div>
                <div className="flex-rows flex space-x-2">
                  <div className="flex flex-initial">Query:</div>
                  <div className="flex flex-initial">{timRange}</div>
                </div>
              </div>

              <div className="mt-5 w-full ">
                <div>
                  <div
                    className={classNames(
                      "flex flex-initial flex-row items-center space-x-2",
                      "rounded px-2 py-1",
                      "mt-2 text-xs font-bold text-gray-700"
                    )}
                  >
                    {retrieved && retrieved.length > 0 && (
                      <p className="text-2xl">
                        Retrieved {retrieved.length} item
                        {retrieved.length == 1 ? "" : "s"}
                      </p>
                    )}
                    {!retrieved && <div className="">Loading...</div>}
                  </div>
                  <div className="ml-4 mt-2 flex flex-col space-y-1">
                    {retrieved.map((r, i) => {
                      return <DocumentView document={r} key={i} />;
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
