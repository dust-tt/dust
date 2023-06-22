import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { ActionButton, HighlightButton } from "@app/components/Button";
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
import { GensRetrievedDocumentType } from "@app/types/gens";
import { UserType, WorkspaceType } from "@app/types/user";

type DataSource = {
  name: string;
  description?: string;
  provider: ConnectorProvider | "none";
  selected: boolean;
};

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
  workspaceDataSources: DataSource[];
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
      prodCredentials,
      readOnly: false,
      gaTrackingId: GA_TRACKING_ID,
      workspaceDataSources: dataSources,
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

export function DocumentView({
  document,
  query,
  owner,
  onScoreReady,
  onExtractUpdate,
}: {
  document: GensRetrievedDocumentType;
  query: string;
  owner: WorkspaceType;
  onScoreReady: (documentId: string, score: number) => void;
  onExtractUpdate: (documentId: string, extract: string) => void;
}) {
  const provider = providerFromDocument(document);

  const [extractedText, setExtractedText] = useState("");
  const [LLMScore, setLLMScore] = useState(0);
<<<<<<< Updated upstream
  useMemo(() => {
=======

  const [chunkExpanded, setChunkExpanded] = useState(false);
  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);

  const interruptRef = useRef<boolean>(false);
  useEffect(() => {
>>>>>>> Stashed changes
    setExtractedText("");
    const extractInput = [
      {
        query: query,
        result: document,
      },
    ];

    const extract_config = cloneBaseConfig(
      DustProdActionRegistry["gens-extract"].config
    );
    runActionStreamed(owner, "gens-extract", extract_config, extractInput)
      .then((res) => {
        if (res.isErr()) {
          console.log("ERROR", res.error);
          return;
        }

        const { eventStream } = res.value;

        const handleEvent = (event: any) => {
          if (event.type === "tokens") {
            let currText = "";
            setExtractedText((t) => {
              currText = t + event.content.tokens.text;
              return currText;
            });
            onExtractUpdate(document.documentId, currText);
          }
          if (event.type === "error") {
            console.log("ERROR error event", event);
            return;
          }
          if (event.type === "block_execution") {
            const e = event.content.execution[0][0];
            if (event.content.block_name === "MODEL") {
              if (e.error) {
                console.log("ERROR block_execution event", e.error);
                return;
              }
            }
          }
          eventStream
            .next()
            .then(({ value, done }) => {
              if (!done) {
                handleEvent(value);
              }
            })
            .catch((e) => console.log(e));
        };

        eventStream
          .next()
          .then(({ value, done }) => {
            if (!done) {
              handleEvent(value);
            }
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => console.log("Error during extract", e));
    const rank_config = cloneBaseConfig(
      DustProdActionRegistry["gens-rank"].config
    );
    runActionStreamed(owner, "gens-rank", rank_config, extractInput)
      .then((res) => {
        if (res.isErr()) {
          console.log("ERROR", res.error);
          return;
        }
        const { eventStream } = res.value;

        const handleEvent = (event: any) => {
          if (event.type == "block_execution") {
            const e = event.content.execution[0][0];
            if (event.content.block_name === "MODEL") {
              if (e.error) {
                console.log("ERROR block_execution event", e.error);
                return;
              }
              const top_logprobs = e.value.completion.top_logprobs;
              const key = Object.keys(top_logprobs[0])[0];
              let score;
              if (key == "YES" || key == " YES") {
                score = Math.exp(top_logprobs[0][key]);
              } else if (key == "NO" || key == " NO") {
                score = 1 - Math.exp(top_logprobs[0][key]);
              } else {
                score = 0;
              }
              setLLMScore(score);
              onScoreReady(document.documentId, score);
              return;
            }
          } else if (event.type == "error") {
            console.log("ERROR during ranking", event);
            return;
          }
          eventStream
            .next()
            .then(({ value, done }) => {
              if (!done) {
                handleEvent(value);
              }
            })
            .catch((e) => console.log(e));
        };
        eventStream
          .next()
          .then(({ value, done }) => {
            if (!done) {
              handleEvent(value);
            }
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => console.log("Error during ranking", e));
  }, [document]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center text-xs">
        <div
          className={classNames(
            "flex flex-initial select-none rounded-md bg-gray-100 bg-gray-300 px-1 py-0.5",
            document.chunks.length > 0 ? "cursor-pointer" : ""
          )}
          onClick={() => {
            if (document.chunks.length > 0) {
              setChunkExpanded(!chunkExpanded);
            }
          }}
        >
          {document.score.toFixed(2)} | {LLMScore.toFixed(2)}
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
        <div className="flex flex-initial">
          <div className="ml-10 border-l-4 border-slate-400">
            <p
              className={classNames(
                "cursor-pointer pl-2 text-xs italic text-gray-500"
              )}
            >
              {extractedText}
            </p>
          </div>
        </div>
      </div>
      {chunkExpanded && (
        <div className="my-2 flex flex-col space-y-2">
          <p>Chunks:</p>
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

export function ResultsView({
  retrieved,
  query,
  owner,
  onExtractUpdate,
}: {
  retrieved: GensRetrievedDocumentType[];
  query: string;
  owner: WorkspaceType;
  onExtractUpdate: (documentId: string, extract: string) => void;
}) {
  const [retrievedDocs, setRetrievedDocs] =
    useState<GensRetrievedDocumentType[]>(retrieved);

  useEffect(() => {
    setRetrievedDocs(retrieved);
  }, [retrieved]);

  const scores: { [key: string]: number } = {};
  const onScoreReady = (docId: string, score: number) => {
    scores[docId] = score;
    const sorted = retrievedDocs.concat().sort((a, b) => {
      return (scores[b.documentId] || 0) - (scores[a.documentId] || 0);
    });
    setRetrievedDocs(sorted);
  };
  return (
    <div className="mt-5 w-full ">
      <div>
        <div
          className={classNames(
            "flex flex-initial flex-row items-center space-x-2",
            "rounded py-1",
            "mt-2 text-xs font-bold text-gray-700"
          )}
        >
          {retrievedDocs && retrievedDocs.length > 0 && (
            <p className="mb-4 text-lg">
              Retrieved {retrievedDocs.length} item
              {retrievedDocs.length == 1 ? "" : "s"}
            </p>
          )}
          {!retrievedDocs && <div className="">Loading...</div>}
        </div>
        <div className="ml-4 mt-2 flex flex-col space-y-1">
          {retrievedDocs.map((r) => {
            return (
              <DocumentView
                document={r}
                key={r.documentId}
                query={query}
                owner={owner}
                onScoreReady={onScoreReady}
                onExtractUpdate={onExtractUpdate}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export class FunctionSingleArgStreamer {
  _textSoFar: string;
  _curParsedPos: number;
  _arg: string;
  _handler: (token: string) => void;

  constructor(arg: string, handler: (token: string) => void) {
    this._arg = arg;
    this._textSoFar = "";
    this._curParsedPos = 0;
    this._handler = handler;
  }

  feed(token: string): void {
    this._textSoFar += token;

    let str = this._textSoFar + '"}';
    if (this._textSoFar.trimEnd().endsWith('"')) {
      // If _textSoFar ends with a quote, we just add the } to the end.
      str = this._textSoFar + "}";
    }

    try {
      const obj = JSON.parse(str);
      if (obj[this._arg]) {
        const tokens = obj[this._arg].slice(this._curParsedPos);
        this._curParsedPos = obj[this._arg].length;
        // console.log("STREAM", tokens);
        this._handler(tokens);
      }
    } catch (e) {
      // Ignore and continue.
    }
  }
}

export default function AppGens({
  user,
  owner,
  prodCredentials,
  readOnly,
  gaTrackingId,
  workspaceDataSources,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const prodAPI = new DustAPI(prodCredentials);

  const [genContent, setGenContent] = useState<string>("");
  const [genCursorPosition, setGenCursorPosition] = useState<number>(0);
  const [genLoading, setGenLoading] = useState<boolean>(false);
  const genInterruptRef = useRef<boolean>(false);
  const genTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const [genDocumentExtracts, setGenDocumentExtracts] = useState<{
    [documentId: string]: string;
  }>({});

  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<string | null>(null);

  const [retrievalLoading, setRetrievalLoading] = useState<boolean>(false);
  const [retrieved, setRetrieved] = useState<GensRetrievedDocumentType[]>([]);
  const [dataSources, setDataSources] =
    useState<DataSource[]>(workspaceDataSources);
  const [top_k, setTopK] = useState<number>(16);

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
    setGenLoading(true);
    genInterruptRef.current = false;

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

    // console.log(textWithCursor);

    const inputs = [
      {
        text_with_cursor: textWithCursor,
        extracts: genDocumentExtracts,
        context: getContext(),
      },
    ];

    // console.log(JSON.stringify(genDocumentExtracts));

    const res = await runActionStreamed(owner, "gens-generate", config, inputs);
    if (res.isErr()) {
      console.log("ERROR", res.error);
      setGenLoading(false);
      return;
    }

    const { eventStream } = res.value;

    const p = new FunctionSingleArgStreamer("content", (tokens) => {
      content = `${content.slice(0, cursorPosition)}${tokens}${content.slice(
        cursorPosition
      )}`;
      cursorPosition += tokens.length;

      setGenContent(content);
      setGenCursorPosition(cursorPosition);
    });

    for await (const event of eventStream) {
      // console.log("EVENT", event, genInterruptRef.current);
      if (genInterruptRef.current) {
        void eventStream.return();
        genInterruptRef.current = false;
        break;
      }

      if (event.type === "function_call_arguments_tokens") {
        const tokens = event.content.tokens.text;
        p.feed(tokens);
      }
      if (event.type === "error") {
        console.log("ERROR error event", event);
        setGenLoading(false);
        genInterruptRef.current = false;
        return;
      }
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "MODEL") {
          if (e.error) {
            console.log("ERROR block_execution event", e.error);
            setGenLoading(false);
            genInterruptRef.current = false;
            return;
          }
        }
      }
    }

    setGenLoading(false);
    genInterruptRef.current = false;
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
    config.DATASOURCE.top_k = top_k;
    config.DATASOURCE.data_sources = dataSources
      .filter((ds) => ds.selected)
      .map((ds) => {
        return {
          workspace_id: prodAPI.workspaceId(),
          data_source_id: ds.name,
        };
      });
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
          setRetrieved(e.value.retrievals);
          console.log("Search completed");
          setRetrievalLoading(false);
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
                      disabled={genLoading}
                      onClick={() => {
                        void handleGenerate();
                      }}
                    >
                      {genLoading ? "Loading..." : "Generate"}
                    </ActionButton>
                  </div>
                  <div
                    className={classNames(
                      "flex flex-initial",
                      genLoading ? "block" : "hidden"
                    )}
                  >
                    <HighlightButton
                      disabled={!genLoading || genInterruptRef.current}
                      onClick={() => {
                        genInterruptRef.current = true;
                      }}
                    >
                      Interrupt
                    </HighlightButton>
                  </div>
                </div>
                <div className="flex-rows flex space-x-2 text-xs font-normal">
                  <div className="flex flex-initial text-gray-400">
                    TimeRange:
                  </div>
                  <div className="flex flex-initial">{timeRange}</div>
                </div>
                <div className="flex-rows flex items-center space-x-2 text-xs font-normal">
                  <div className="flex flex-initial text-gray-400">TopK:</div>
                  <div className="flex flex-initial">
                    <input
                      type="number"
                      className="border-1 w-16 rounded-md border-gray-100 px-2 py-1 text-sm hover:border-gray-300 focus:border-gray-300 focus:ring-0"
                      value={top_k}
                      placeholder="Top K"
                      onChange={(e) => setTopK(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="mb-4 mt-2 flex flex-row flex-wrap items-center text-xs font-normal">
                  <div className="flex flex-initial text-gray-400">
                    Data Sources:
                  </div>
                  <div className="ml-1 flex flex-row">
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
                              <img src={PROVIDER_LOGO_PATH[ds.provider]}></img>
                            ) : (
                              <DocumentDuplicateIcon className="-ml-0.5 h-4 w-4 text-slate-500" />
                            )}
                          </div>
                          <div className="absolute z-0 hidden rounded group-hover:block">
                            <div className="relative bottom-8 border bg-white px-1 py-1 ">
                              <span className="text-gray-600">
                                <span className="font-semibold">{ds.name}</span>
                                {ds.description ? ` ${ds.description}` : null}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <ResultsView
                retrieved={retrieved}
                query={genContent}
                owner={owner}
                onExtractUpdate={(documentId, extract) => {
                  setGenDocumentExtracts((c) => {
                    return {
                      ...c,
                      [documentId]: extract,
                    };
                  });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
