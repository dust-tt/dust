import {
  ClipboardCheckIcon,
  ClipboardIcon,
  DocumentTextIcon,
  IconButton,
  Tooltip,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import {
  amber,
  blue,
  emerald,
  pink,
  slate,
  violet,
  yellow,
} from "tailwindcss/colors";
import { visit } from "unist-util-visit";

import { classNames } from "@app/lib/utils";
import { RetrievalDocumentType } from "@app/types/assistant/actions/retrieval";
import { AgentConfigurationType } from "@app/types/assistant/agent";

import {
  linkFromDocument,
  PROVIDER_LOGO_PATH,
  providerFromDocument,
  titleFromDocument,
} from "./conversation/RetrievalAction";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

function mentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention") {
        const data = node.data || (node.data = {});
        data.hName = "mention";
        data.hProperties = {
          agentSId: node.attributes.sId,
          agentName: node.children[0].value,
        };
      }
    });
  };
}

function citeDirective() {
  // Initialize a counter to keep track of citation references, starting from 1.
  let refCounter = 1;
  const refSeen: { [ref: string]: number } = {};

  const counter = (ref: string) => {
    if (!refSeen[ref]) {
      refSeen[ref] = refCounter++;
    }
    return refSeen[ref];
  };

  return () => {
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === "cite" && node.children[0]?.value) {
          const data = node.data || (node.data = {});

          const references = node.children[0]?.value
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length == 2)
            .map((ref: string) => ({
              counter: counter(ref),
              ref,
            }));

          // `sup` will then be mapped to a custom component `CiteBlock`.
          data.hName = "sup";
          data.hProperties = {
            references: JSON.stringify(references),
          };
        }
      });
    };
  };
}

function addClosingBackticks(str: string): string {
  // Regular expression to find either a single backtick or triple backticks
  const regex = /(`{1,3})/g;
  let singleBackticks = 0;
  let tripleBackticks = 0;

  // Search for all backticks in the string and update counts
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match[1] === "```") {
      tripleBackticks++;
    } else if (match[1] === "`") {
      singleBackticks++;
    }
  }
  // Append closing backticks if needed
  if (tripleBackticks % 2 !== 0) {
    if (str.endsWith("`")) {
      str += "``";
    } else if (str.endsWith("``")) {
      str += "`";
    } else {
      str += str.includes("\n") ? "\n```" : "```";
    }
  } else if (singleBackticks % 2 !== 0) {
    str += "`";
  }
  return str;
}

export function RenderMessageMarkdown({
  content,
  blinkingCursor,
  references,
  agentConfigurations,
}: {
  content: string;
  blinkingCursor: boolean;
  references?: { [key: string]: RetrievalDocumentType };
  agentConfigurations?: AgentConfigurationType[];
}) {
  return (
    <div className={blinkingCursor ? "blinking-cursor" : ""}>
      <ReactMarkdown
        linkTarget="_blank"
        components={{
          pre: PreBlock,
          code: CodeBlock,
          a: LinkBlock,
          ul: UlBlock,
          ol: OlBlock,
          li: LiBlock,
          p: ParagraphBlock,
          sup: CiteBlockWrapper(references || {}),
          table: TableBlock,
          thead: TableHeadBlock,
          tbody: TableBodyBlock,
          th: TableHeaderBlock,
          td: TableDataBlock,
          // @ts-expect-error - `mention` is a custom tag, currently refused by
          // react-markdown types although the functionality is supported
          mention: ({ agentName, agentSId }) => {
            const agentConfiguration = agentConfigurations?.find(
              (agentConfiguration) => agentConfiguration.sId === agentSId
            );
            return (
              <MentionBlock
                agentConfiguration={agentConfiguration}
                agentName={agentName}
              />
            );
          },
        }}
        remarkPlugins={[
          remarkDirective,
          mentionDirective,
          citeDirective(),
          remarkGfm,
        ]}
      >
        {addClosingBackticks(content)}
      </ReactMarkdown>
    </div>
  );
}

function MentionBlock({
  agentName,
  agentConfiguration,
}: {
  agentName: string;
  agentConfiguration?: AgentConfigurationType;
}) {
  const statusText =
    !agentConfiguration || agentConfiguration?.status === "archived"
      ? "(This assistant was deleted)"
      : agentConfiguration?.status === "active"
      ? ""
      : "(This assistant is deactivated for this workspace)";
  const tooltipLabel = agentConfiguration?.description || "" + " " + statusText;
  return (
    <span className="inline-block cursor-default font-medium text-brand">
      <Tooltip label={tooltipLabel} position="below">
        @{agentName}
      </Tooltip>
    </span>
  );
}

function isCiteProps(props: ReactMarkdownProps): props is ReactMarkdownProps & {
  references: string;
} {
  return Object.prototype.hasOwnProperty.call(props, "references");
}

function CiteBlockWrapper(references: {
  [key: string]: RetrievalDocumentType;
}) {
  const CiteBlock = (props: ReactMarkdownProps) => {
    if (isCiteProps(props) && props.references) {
      const refs = (
        JSON.parse(props.references) as {
          counter: number;
          ref: string;
        }[]
      ).filter((r) => r.ref in references);

      return (
        <>
          {refs.map((r, i) => {
            const document = references[r.ref];

            const provider = providerFromDocument(document);
            const title = titleFromDocument(document);
            const link = linkFromDocument(document);

            const citeClassNames = classNames(
              "rounded-md bg-structure-100 px-1",
              "text-xs font-semibold text-action-500",
              "hover:bg-structure-200 hover:text-action-600"
            );

            return (
              <sup key={`${r.ref}-${i}`}>
                <Tooltip
                  contentChildren={
                    <div className="flex flex-row items-center gap-x-1">
                      <div className={classNames("mr-1 flex h-4 w-4")}>
                        {provider !== "none" ? (
                          <img src={PROVIDER_LOGO_PATH[provider]}></img>
                        ) : (
                          <DocumentTextIcon className="h-4 w-4 text-slate-500" />
                        )}
                      </div>
                      <div className="text-md flex whitespace-nowrap">
                        {title}
                      </div>
                    </div>
                  }
                  position="below"
                >
                  <a
                    // TODO(spolu): for custom data source add data source name to title
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={citeClassNames}
                  >
                    {r.counter}
                  </a>
                </Tooltip>
              </sup>
            );
          })}
        </>
      );
    } else {
      const { children } = props;
      return <sup>{children}</sup>;
    }
  };
  return CiteBlock;
}

function TableBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-auto overflow-x-auto rounded-lg border border-structure-200 dark:border-structure-200-dark">
      <table className="w-full table-auto">{children}</table>
    </div>
  );
}

function TableHeadBlock({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-structure-50 px-2 py-2 dark:bg-structure-50-dark">
      {children}
    </thead>
  );
}

function TableBodyBlock({ children }: { children: React.ReactNode }) {
  return <tbody className="bg-white">{children}</tbody>;
}

function TableHeaderBlock({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-element-700 dark:text-element-700-dark">
      {children}
    </th>
  );
}

function TableDataBlock({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-element-800 dark:text-element-800-dark">
      {children}
    </td>
  );
}

function LinkBlock({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-blue-500 hover:underline"
    >
      {children}
    </a>
  );
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const validChildrenContent =
    Array.isArray(children) && children[0]
      ? children[0].props.children[0]
      : null;

  // Sometimes the children are not valid, but the meta data is
  let fallbackData: string | null = null;
  if (!validChildrenContent) {
    fallbackData =
      Array.isArray(children) && children[0]
        ? children[0].props?.node.data?.meta
        : null;
  }

  const handleClick = async () => {
    await navigator.clipboard.writeText(
      validChildrenContent || fallbackData || ""
    );
    setConfirmed(true);
    void setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <pre className="my-2 w-full break-all rounded-md bg-slate-800">
      <div className="relative">
        <div className="absolute right-2 top-2">
          {(validChildrenContent || fallbackData) && (
            <div className="flex gap-2 align-bottom">
              <div className="text-xs text-slate-300">
                <a onClick={handleClick} className="cursor-pointer">
                  {confirmed ? "Copied!" : "Copy"}
                </a>
              </div>
              <IconButton
                variant="tertiary"
                size="xs"
                icon={confirmed ? ClipboardCheckIcon : ClipboardIcon}
                onClick={handleClick}
              />
            </div>
          )}
        </div>
        <div className="overflow-auto pt-8 text-sm">
          {validChildrenContent ? children : fallbackData || children}
        </div>
      </div>
    </pre>
  );
}

function UlBlock({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc py-2 pl-8 first:pt-0 last:pb-0">{children}</ul>
  );
}
function OlBlock({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal py-3 pl-8 first:pt-0 last:pb-0">{children}</ol>
  );
}
function LiBlock({ children }: { children: React.ReactNode }) {
  return <li className="py-2 first:pt-0 last:pb-0">{children}</li>;
}
function ParagraphBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="whitespace-pre-wrap py-2 first:pt-0 last:pb-0">
      {children}
    </div>
  );
}

function CodeBlock({
  inline,
  className,
  children,
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";
  const slate900 = slate["900"];
  const slate50 = slate["50"];
  const emerald500 = emerald["500"];
  const amber400 = amber["400"];
  const amber200 = amber["200"];
  const pink400 = pink["400"];
  const yellow300 = yellow["300"];
  const blue400 = blue["400"];
  const violet400 = violet["400"];

  const languageOverrides: { [key: string]: string } = {
    jsx: "javascript",
    tsx: "typescript",
  };

  const languageToUse = languageOverrides[language] || language;

  return !inline && language ? (
    <SyntaxHighlighter
      className="rounded-md"
      style={{
        "hljs-comment": {
          color: amber200,
        },
        "hljs-quote": {
          color: amber200,
        },
        "hljs-variable": {
          color: emerald500,
        },
        "hljs-template-variable": {
          color: pink400,
        },
        "hljs-tag": {
          color: pink400,
        },
        "hljs-name": {
          color: pink400,
        },
        "hljs-selector-id": {
          color: pink400,
        },
        "hljs-selector-class": {
          color: pink400,
        },
        "hljs-regexp": {
          color: pink400,
        },
        "hljs-deletion": {
          color: pink400,
        },
        "hljs-number": {
          color: amber400,
        },
        "hljs-built_in": {
          color: amber400,
        },
        "hljs-builtin-name": {
          color: amber400,
        },
        "hljs-literal": {
          color: amber400,
        },
        "hljs-type": {
          color: amber400,
        },
        "hljs-params": {
          color: amber400,
        },
        "hljs-meta": {
          color: amber400,
        },
        "hljs-link": {
          color: amber400,
        },
        "hljs-attribute": {
          color: yellow300,
        },
        "hljs-string": {
          color: emerald500,
        },
        "hljs-symbol": {
          color: emerald500,
        },
        "hljs-bullet": {
          color: emerald500,
        },
        "hljs-addition": {
          color: emerald500,
        },
        "hljs-title": {
          color: blue400,
        },
        "hljs-section": {
          color: blue400,
        },
        "hljs-keyword": {
          color: violet400,
        },
        "hljs-selector-tag": {
          color: violet400,
        },
        hljs: {
          display: "block",
          overflowX: "auto",
          background: slate900,
          color: slate50,
          padding: "1em",
        },
        "hljs-emphasis": {
          fontStyle: "italic",
        },
        "hljs-strong": {
          fontWeight: "bold",
        },
      }}
      language={languageToUse}
      PreTag="div"
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  ) : (
    <code className="rounded-md border-structure-200 bg-structure-100 px-1.5 py-1 text-sm text-amber-600 dark:border-structure-200-dark dark:bg-structure-100-dark dark:text-amber-400">
      {children}
    </code>
  );
}
