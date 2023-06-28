import {
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, Fragment, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import AppLayout from "@app/components/AppLayout";
import { ActionButton, HighlightButton } from "@app/components/Button";
import { Spinner } from "@app/components/Spinner";
import GensTimeRangePicker, {
  gensDefaultTimeRange,
  GensTimeRange,
  msForTimeRange,
} from "@app/components/use/GensTimeRangePicker";
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

import { Dialog, Transition } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/20/solid";

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
  template,
  onScoreReady,
  onExtractUpdate,
}: {
  document: GensRetrievedDocumentType;
  query: string;
  owner: WorkspaceType;
  template: TemplateType | null;
  onScoreReady: (documentId: string, score: number) => void;
  onExtractUpdate: (documentId: string, extract: string) => void;
}) {
  const provider = providerFromDocument(document);

  const [extractedText, setExtractedText] = useState("");
  const [LLMScore, setLLMScore] = useState<number | null>(null);

  const [chunkExpanded, setChunkExpanded] = useState(false);
  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);

  const interruptRef = useRef<boolean>(false);
  useEffect(() => {
    setExtractedText("");

    const extract_config = cloneBaseConfig(
      DustProdActionRegistry["gens-summary"].config
    );

    const extractInput = [
      {
        query: query,
        result: document,
      },
    ];

    runActionStreamed(owner, "gens-summary", extract_config, extractInput)
      .then((res) => {
        console.log("Summarizing...");
        if (res.isErr()) {
          console.log("ERROR", res.error);
          return;
        }

        const { eventStream } = res.value;
        const p = new FunctionSingleArgStreamer("summary", (tokens) =>
          setExtractedText((t) => {
            onExtractUpdate(document.documentId, t + tokens);
            return t + tokens;
          })
        );
        const handleEvent = (event: any) => {
          if (event.type === "function_call_arguments_tokens") {
            const tokens = event.content.tokens.text;
            p.feed(tokens);
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
              if (done || interruptRef.current) {
                return eventStream.return();
              }
              handleEvent(value);
            })
            .catch((e) => console.log(e));
        };

        eventStream
          .next()
          .then(({ value, done }) => {
            if (done || interruptRef.current) {
              return eventStream.return();
            }
            handleEvent(value);
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => console.log("Error during summary", e));
    return () => {
      console.log("Trying to unmount");
      interruptRef.current = true;
    };
  }, [document.documentId]);

  useEffect(() => {
    const extractInput = [
      {
        query: query,
        result: document,
        instructions: template?.instructions || [],
      },
    ];

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
              const logprobs_score = e.value.completion.top_logprobs[0];
              const key = Object.keys(logprobs_score)[0];
              let score;
              if (
                key == "YES" ||
                key == " YES" ||
                key == " Yes" ||
                key == " yes"
              ) {
                score = Math.exp(logprobs_score[key]);
              } else if (
                key == "NO" ||
                key == " NO" ||
                key == " No" ||
                key == " no"
              ) {
                score = 1 - Math.exp(logprobs_score[key]);
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
              if (done || interruptRef.current) {
                return eventStream.return();
              }
              handleEvent(value);
            })
            .catch((e) => console.log(e));
        };
        eventStream
          .next()
          .then(({ value, done }) => {
            if (done || interruptRef.current) {
              return eventStream.return();
            }
            handleEvent(value);
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => console.log("Error during ranking", e));
    return () => {
      interruptRef.current = true;
    };
  }, [document.documentId]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center text-xs">
        <div
          className={classNames(
            "flex flex-initial select-none rounded-md bg-gray-100 bg-gray-300 px-1 pb-0.5 pt-1",
            document.chunks.length > 0 ? "cursor-pointer" : ""
          )}
          onClick={() => {
            if (document.chunks.length > 0) {
              setChunkExpanded(!chunkExpanded);
            }
          }}
        >
          {LLMScore !== null ? (
            <span>
              {LLMScore.toFixed(2)}{" "}
              <span className="text-[0.6rem] text-gray-600">
                {document.score.toFixed(2)}
              </span>
            </span>
          ) : (
            <span>{document.score.toFixed(2)}</span>
          )}
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
        <p className="text-black-500 ml-3 text-xs">{extractedText}</p>
      </div>
      {chunkExpanded && (
        <div className="mb-2 flex flex-col space-y-2">
          <p className="ml-4 text-xs">Raw chunks:</p>
          {document.chunks.map((chunk, i) => (
            <div key={i} className="flex flex-initial">
              <div
                className="ml-8 border-l-4 border-slate-400"
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
  template,
  onExtractUpdate,
  onScoreReady,
}: {
  retrieved: GensRetrievedDocumentType[];
  query: string;
  owner: WorkspaceType;
  template: TemplateType | null;
  onExtractUpdate: (documentId: string, extract: string) => void;
  onScoreReady: (documentId: string, score: number) => void;
}) {
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
          {retrieved && retrieved.length > 0 && (
            <p className="mb-4 text-lg">
              Retrieved {retrieved.length} item
              {retrieved.length == 1 ? "" : "s"}
            </p>
          )}
          {!retrieved && <div className="">Loading...</div>}
        </div>
        <div className="mt-2 flex flex-col space-y-2">
          {retrieved.map((r) => {
            return (
              <DocumentView
                document={r}
                key={r.documentId}
                query={query}
                owner={owner}
                template={template}
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

type TemplateType = {
  name: string;
  color: string;
  instructions: string[];
};

export function TemplatesView({
  onTemplateSelect,
}: {
  onTemplateSelect: (template: TemplateType) => void;
}) {
  const defaults = [
    {
      name: "Fact Gatherer",
      color: "bg-red-500",
      instructions: [
        "Extract facts and important information in a list",
        "Present your answers in list format",
        "The user text is part of a document they're writing on the topic, and we want to help them get access to more information. The user might be mid-sentence, we just want to get context and helpful information",
        "Don't say things like 'based on the document', 'The main points are', ... If you can't find useful information, just say so",
        "We just want to gather facts and answers related to the document text",
      ],
    },
    {
      name: "Contradictor",
      color: "bg-blue-500",
      instructions: [
        "Find documents and ideas that might contradict or disagree with the user's text",
      ],
    },
    {
      name: "Poet",
      color: "bg-yellow-500",
      instructions: ["Be creative, fanciful, and only speak in poetry"],
    },
    {
      name: "Pirate",
      color: "bg-green-500",
      instructions: ["Be a pirate, and only speak in pirate language"],
    },
  ];

  const [templates, setTemplates] = useState(defaults);
  const [selectedTemplate, setSelectedTemplate] = useState<number>(0);
  const [newTemplateTitle, setNewTemplateTitle] = useState<string>("");
  const [newTemplateInstructions, setNewTemplateInstructions] = useState<
    string[]
  >([]);
  const [formExpanded, setFormExpanded] = useState<boolean>(false);
  const [hover, setHover] = useState<number>(-1);

  useEffect(() => {
    const savedTemplates = localStorage.getItem("dust_gens_templates");
    if (savedTemplates) {
      setTemplates(JSON.parse(savedTemplates));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dust_gens_templates", JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    if (selectedTemplate != -1) {
      onTemplateSelect(templates[selectedTemplate]);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    onTemplateSelect(templates[0]);
  }, []);

  const handleInstructionChange = (index: number, value: string) => {
    setNewTemplateInstructions((prevInstructions) => {
      const newInstructions = [...prevInstructions];
      newInstructions[index] = value;
      return newInstructions;
    });
  };

  return (
    <div className="mt-5 w-48 flex-initial flex-shrink-0 p-5">
      <div>
        Templates
        <div className="justify-items flex space-x-2">
          <ActionButton
            onClick={() => {
              setSelectedTemplate(-1);
              setFormExpanded(true);
            }}
          >
            +
          </ActionButton>
        </div>
        <Transition.Root show={formExpanded} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-10"
            onClose={() => setFormExpanded(false)}
          >
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-800 bg-opacity-75 transition-opacity" />
            </Transition.Child>

            <div className="fixed inset-0 z-10 overflow-y-auto">
              <div className="flex min-h-full items-end items-center justify-center p-4">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  leave="ease-in duration-200"
                  leaveTo="opacity-0"
                >
                  <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6 lg:max-w-lg">
                    <div>
                      <div className="mt-3">
                        <Dialog.Title
                          as="h3"
                          className="text-lg font-medium leading-6 text-gray-900"
                        >
                          Edit Template
                        </Dialog.Title>
                        <div className="mt-6">
                          <input
                            type="text"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                            placeholder="Template title"
                            value={newTemplateTitle}
                            onChange={(e) =>
                              setNewTemplateTitle(e.target.value)
                            }
                          />
                        </div>
                        <p className="my-2">Instructions</p>
                        {newTemplateInstructions.map((instruction, i) => {
                          return (
                            <div className="my-2" key={i}>
                              <input
                                type="text"
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                                value={instruction}
                                onChange={(e) =>
                                  handleInstructionChange(i, e.target.value)
                                }
                              />
                            </div>
                          );
                        })}
                        <ActionButton
                          onClick={() => {
                            setNewTemplateInstructions(
                              newTemplateInstructions.concat([""])
                            );
                          }}
                        >
                          +
                        </ActionButton>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-row items-center space-x-2 sm:mt-6">
                      <div className="flex-1"></div>
                      <div className="flex flex-initial">
                        <ActionButton onClick={() => setFormExpanded(false)}>
                          Cancel
                        </ActionButton>
                      </div>
                      <ActionButton
                        onClick={() => {
                          setFormExpanded(false);
                          let colors = ["red", "yellow", "green", "blue"];
                          const new_template = {
                            name: newTemplateTitle,
                            // set random color
                            color: `bg-${
                              colors[Math.floor(Math.random() * colors.length)]
                            }-500`,
                            instructions: newTemplateInstructions,
                          };
                          console.log(new_template);
                          const curr_templates = templates.map((d) => d);
                          if (selectedTemplate == -1) {
                            curr_templates.push(new_template);
                          } else {
                            curr_templates[selectedTemplate] = new_template;
                          }
                          console.log(curr_templates);
                          setTemplates(curr_templates);
                          setFormExpanded(false);
                          setNewTemplateInstructions([]);
                          setNewTemplateTitle("");
                        }}
                      >
                        Save
                      </ActionButton>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition.Root>
        <div className="mt-2 flex flex-col space-y-2">
          {templates.map((t, i) => {
            return (
              // round circle div with given color
              <div
                key={i}
                className="align-items group ml-1 mt-2 flex items-center space-x-2"
                onClick={() => {
                  setSelectedTemplate(i);
                  onTemplateSelect(t);
                }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(-1)}
              >
                <button
                  className={classNames(
                    "rounded py-1",
                    "text-xs font-bold text-gray-700",
                    "h-5 w-5 rounded-full",
                    t.color,
                    // make opacity lower for unselected
                    selectedTemplate === i ? "opacity-100" : "opacity-30"
                  )}
                />
                {hover === i && (
                  <>
                    <span className="text-xs text-gray-600">
                      <span className="font-semibold">{t.name}</span>
                    </span>

                    <PencilSquareIcon
                      onClick={() => {
                        setSelectedTemplate(i);
                        setNewTemplateInstructions(t.instructions);
                        setNewTemplateTitle(t.name);
                        setFormExpanded(true);
                      }}
                      className="h-5 w-5"
                    />
                    <TrashIcon
                      onClick={() => {
                        const curr_templates = templates.map((d) => d);
                        curr_templates.splice(i, 1);
                        setTemplates(curr_templates);
                      }}
                      className="h-5 w-5"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/*

                <div className="absolute z-0 hidden rounded group-hover:block">
                  <div className="relative bottom-8 border bg-white px-0.5 py-1 ">
                  </div>
                </div>
*/

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

  const [inferTimeRangeLoading, setInferTimeRangeLoading] =
    useState<boolean>(false);
  const [timeRange, setTimeRange] =
    useState<GensTimeRange>(gensDefaultTimeRange);

  const [retrievalLoading, setRetrievalLoading] = useState<boolean>(false);
  const [retrieved, setRetrieved] = useState<GensRetrievedDocumentType[]>([]);
  const [dataSources, setDataSources] =
    useState<DataSource[]>(workspaceDataSources);
  const [top_k, setTopK] = useState<number>(16);

  const template = useRef<TemplateType | null>(null);

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

  // keeping this here for later:
  const onExtractUpdate = (documentId: string, extract: string) => {
    return [documentId, extract];
  };

  const onScoreReady = (documentId: string, score: number) => {
    setRetrieved((r) => {
      const retrieved = [...r];
      // TODO: make this more efficient by just moving that doc around
      retrieved.filter((d) => d.documentId == documentId)[0].llm_score = score;
      retrieved.sort((a, b) => {
        return (b.llm_score || 0) - (a.llm_score || 0);
      });
      return retrieved;
    });
  };

  const handleGenChange = (value: string) => {
    setGenContent(value);
  };

  const handleInferTimeRange = async () => {
    setInferTimeRangeLoading(true);

    const config = cloneBaseConfig(
      DustProdActionRegistry["gens-time-range"].config
    );
    const inputs = [{ text: genContent, context: getContext() }];

    const res = await runActionStreamed(
      owner,
      "gens-time-range",
      config,
      inputs
    );
    if (res.isErr()) {
      setInferTimeRangeLoading(false);
      return;
    }

    const { eventStream } = res.value;

    for await (const event of eventStream) {
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (event.content.block_name === "OUTPUT") {
          if (!e.error) {
            setTimeRange(e.value.time_range as GensTimeRange);
          }
        }
      }
    }
    setInferTimeRangeLoading(false);
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

    // turn genDocumentExtracts into an array of extracts ordered by score
    const extracts = retrieved
      .map((d) => {
        const chunks = d.chunks.sort((a, b) => a.offset - b.offset);
        const text = chunks.map((c) => c.text).join("");
        return {
          documentId: d.documentId,
          text: text,
          score: d.llm_score || 0,
        };
      })
      .sort((a, b) => a.score - b.score)
      .map((e) => {
        return {
          documentId: e.documentId,
          extract: e.text,
          score: e.score.toFixed(2),
        };
      });

    console.log(extracts);

    const inputs = [
      {
        text_with_cursor: textWithCursor,
        extracts,
        context: getContext(),
        instructions: template.current?.instructions,
      },
    ];
    console.log(template.current?.instructions);

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
    setRetrieved([]);

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

    if (timeRange.unit !== "all") {
      config.DATASOURCE.filter = {
        timestamp: { gt: Date.now() - msForTimeRange(timeRange) },
      };
    }

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
              <div className="flex flex-col space-y-3 text-sm font-medium leading-8 text-gray-700">
                <div className="w-70 flex font-normal">
                  <TextareaAutosize
                    minRows={8}
                    ref={genTextAreaRef}
                    className={classNames(
                      "font-mono block w-full resize-none rounded-md bg-slate-100 px-2 py-1 text-[13px] font-normal",
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

                  <TemplatesView
                    onTemplateSelect={(t) => (template.current = t)}
                  />
                </div>
                <div className="flex-rows flex space-x-2">
                  <div className="flex flex-initial">
                    <ActionButton
                      disabled={retrievalLoading}
                      onClick={() => {
                        void handleSearch();
                      }}
                    >
                      <MagnifyingGlassIcon className="mr-1 h-4 w-4 text-gray-100" />
                      {retrievalLoading ? "Loading..." : "Search"}
                    </ActionButton>
                  </div>
                  <div className="flex flex-initial">
                    <ActionButton
                      disabled={genLoading}
                      onClick={() => {
                        void handleGenerate();
                      }}
                    >
                      <SparklesIcon className="mr-1 h-4 w-4 text-gray-100" />
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
                <div className="items-center space-y-1 text-xs font-normal">
                  <div className="flex flex-row items-center space-x-2 leading-8">
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
                  <div className="flex flex-row items-center space-x-2 leading-8">
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
                                <img
                                  src={PROVIDER_LOGO_PATH[ds.provider]}
                                ></img>
                              ) : (
                                <DocumentDuplicateIcon className="-ml-0.5 h-4 w-4 text-slate-500" />
                              )}
                            </div>
                            <div className="absolute z-0 hidden rounded leading-3 group-hover:block">
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
                  </div>
                  <div className="flex flex-row items-center space-x-2 leading-8">
                    <div className="flex flex-initial text-gray-400">
                      Time range:
                    </div>
                    <div className="flex flex-initial cursor-pointer text-gray-400">
                      {inferTimeRangeLoading ? (
                        <div className="mt-0.5">
                          <Spinner />
                        </div>
                      ) : (
                        <SparklesIcon
                          className="h-4 w-4 text-yellow-400"
                          onClick={handleInferTimeRange}
                        />
                      )}
                    </div>
                    <GensTimeRangePicker
                      timeRange={timeRange}
                      onTimeRangeUpdate={setTimeRange}
                    />
                  </div>
                </div>

                <div className="mb-4 mt-2 flex flex-row flex-wrap items-center text-xs font-normal"></div>
              </div>

              <ResultsView
                retrieved={retrieved}
                query={genContent}
                owner={owner}
                onExtractUpdate={onExtractUpdate}
                onScoreReady={onScoreReady}
                template={template.current}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
