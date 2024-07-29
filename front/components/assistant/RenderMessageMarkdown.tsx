import { IconButton, SparklesIcon, WrenchIcon } from "@dust-tt/sparkle";
import type { WebsearchResultType } from "@dust-tt/types";
import type { RetrievalDocumentType } from "@dust-tt/types";
import mermaid from "mermaid";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import React, { useEffect, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/complex-types";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
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

import { makeLinkForRetrievedDocument } from "@app/components/actions/retrieval/utils";
import {
  MermaidDisplayProvider,
  MermaidGraph,
  useMermaidDisplay,
} from "@app/components/assistant/RenderMermaid";
import type { GetContentToDownloadFunction } from "@app/components/misc/ContentBlockWrapper";
import { ContentBlockWrapper } from "@app/components/misc/ContentBlockWrapper";
import { classNames } from "@app/lib/utils";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

function mentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention" && node.children[0]) {
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

type CitationsContextType = {
  references: {
    [key: string]: RetrievalDocumentType | WebsearchResultType;
  };
  updateActiveReferences: (
    doc: RetrievalDocumentType | WebsearchResultType,
    index: number
  ) => void;
  setHoveredReference: (index: number | null) => void;
};

export const CitationsContext = React.createContext<CitationsContextType>({
  references: {},
  updateActiveReferences: () => null,
  setHoveredReference: () => null,
});

export function RenderMessageMarkdown({
  content,
  isStreaming,
  citationsContext,
}: {
  content: string;
  isStreaming: boolean;
  citationsContext?: CitationsContextType;
}) {
  // Memoize markdown components to avoid unnecessary re-renders that disrupt text selection
  const markdownComponents: Components = useMemo(
    () => ({
      pre: ({ children }) => (
        <PreBlock isStreaming={isStreaming}>{children}</PreBlock>
      ),
      code: CodeBlockWithExtendedSupport,
      a: LinkBlock,
      ul: UlBlock,
      ol: OlBlock,
      li: LiBlock,
      p: ParagraphBlock,
      sup: CiteBlock,
      table: TableBlock,
      thead: TableHeadBlock,
      tbody: TableBodyBlock,
      th: TableHeaderBlock,
      td: TableDataBlock,
      h1: ({ children }) => (
        <h1 className="pb-2 pt-4 text-5xl font-semibold text-element-900">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="pb-2 pt-4 text-4xl font-semibold text-element-900">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="pb-2 pt-4 text-2xl font-semibold text-element-900">
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className="pb-2 pt-3 text-lg font-bold text-element-900">
          {children}
        </h4>
      ),
      h5: ({ children }) => (
        <h5 className="pb-1.5 pt-2.5 text-lg font-medium text-element-900">
          {children}
        </h5>
      ),
      h6: ({ children }) => (
        <h6 className="pb-1.5 pt-2.5 text-base font-bold text-element-900">
          {children}
        </h6>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold text-element-900">{children}</strong>
      ),
      // @ts-expect-error - `mention` is a custom tag, currently refused by
      // react-markdown types although the functionality is supported
      mention: ({ agentName }) => {
        return <MentionBlock agentName={agentName} />;
      },
    }),
    [isStreaming]
  );

  const markdownPlugins = useMemo(
    () => [
      remarkDirective,
      mentionDirective,
      citeDirective(),
      remarkGfm,
      remarkMath,
    ],
    []
  );

  return (
    <div className={classNames("w-full", isStreaming ? "blinking-cursor" : "")}>
      <CitationsContext.Provider
        value={
          citationsContext || {
            references: {},
            updateActiveReferences: () => null,
            setHoveredReference: () => null,
          }
        }
      >
        <MermaidDisplayProvider>
          <ReactMarkdown
            linkTarget="_blank"
            components={markdownComponents}
            remarkPlugins={markdownPlugins}
            rehypePlugins={[rehypeKatex] as PluggableList}
          >
            {addClosingBackticks(content)}
          </ReactMarkdown>
        </MermaidDisplayProvider>
      </CitationsContext.Provider>
    </div>
  );
}

function MentionBlock({ agentName }: { agentName: string }) {
  return (
    <span className="inline-block cursor-default font-medium text-brand">
      @{agentName}
    </span>
  );
}

function isCiteProps(props: ReactMarkdownProps): props is ReactMarkdownProps & {
  references: string;
} {
  return Object.prototype.hasOwnProperty.call(props, "references");
}

function CiteBlock(props: ReactMarkdownProps) {
  const { references, updateActiveReferences, setHoveredReference } =
    React.useContext(CitationsContext);
  const refs =
    isCiteProps(props) && props.references
      ? (
          JSON.parse(props.references) as {
            counter: number;
            ref: string;
          }[]
        ).filter((r) => r.ref in references)
      : undefined;

  useEffect(() => {
    if (refs) {
      refs.forEach((r) => {
        const document = references[r.ref];
        updateActiveReferences(document, r.counter);
      });
    }
  }, [refs, references, updateActiveReferences]);

  if (refs) {
    return (
      <span className="inline-flex space-x-1">
        {refs.map((r, i) => {
          const document = references[r.ref];
          const link =
            "link" in document
              ? document.link
              : makeLinkForRetrievedDocument(document);

          return (
            <sup key={`${r.ref}-${i}`}>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setHoveredReference(r.counter)}
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-semibold text-element-800 hover:border-violet-400">
                  {r.counter}
                </div>
              </a>
            </sup>
          );
        })}
      </span>
    );
  } else {
    const { children } = props;
    return <sup>{children}</sup>;
  }
}

const getNodeText = (node: ReactNode): string => {
  if (["string", "number"].includes(typeof node)) {
    return node as string;
  }
  if (node instanceof Array) {
    return node.map(getNodeText).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    return getNodeText(node.props.children);
  }

  return "";
};

function TableBlock({ children }: { children: React.ReactNode }) {
  const tableData = useMemo(() => {
    const [headNode, bodyNode] = Array.from(children as [any, any]);
    if (
      !headNode ||
      !bodyNode ||
      !("props" in headNode) ||
      !("props" in bodyNode)
    ) {
      return;
    }

    const headCells = headNode.props.children[0].props.children.map((c: any) =>
      getNodeText(c.props.children)
    );

    const headHtml = `<thead><tr>${headCells
      .map((c: any) => `<th><b>${c}</b></th>`)
      .join("")}</tr></thead>`;
    const headPlain = headCells.join("\t");

    const bodyRows = bodyNode.props.children.map((r: any) =>
      r.props.children.map((c: any) => getNodeText(c))
    );
    const bodyHtml = `<tbody>${bodyRows
      .map((row: any) => {
        return `<tr>${row
          .map((cell: any) => `<td>${cell}</td>`)
          .join("")}</tr>`;
      })
      .join("")}</tbody>`;
    const bodyPlain = bodyRows.map((row: any) => row.join("\t")).join("\n");

    return {
      "text/html": `<table>${headHtml}${bodyHtml}</table>`,
      "text/plain": headPlain + "\n" + bodyPlain,
    };
  }, [children]);

  return (
    <ContentBlockWrapper
      className="border border-structure-200 dark:border-structure-200-dark"
      content={tableData}
    >
      <table className="w-full table-auto">{children}</table>
    </ContentBlockWrapper>
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
      {Array.isArray(children) ? (
        children.map((child: any, i) => {
          if (child === "<br>") {
            return <br key={i} />;
          }
          return <React.Fragment key={i}>{getNodeText(child)}</React.Fragment>;
        })
      ) : (
        <> {getNodeText(children)}</>
      )}
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
      className="break-all font-semibold text-action-500 transition-all duration-200 ease-in-out hover:text-action-400 hover:underline active:text-action-600"
    >
      {children}
    </a>
  );
}

const detectLanguage = (children: React.ReactNode) => {
  if (Array.isArray(children) && children[0]) {
    return children[0].props.className?.replace("language-", "") || "text";
  }

  return "text";
};

function PreBlock({
  children,
  isStreaming,
}: {
  children: React.ReactNode;
  isStreaming: boolean;
}) {
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

  const text = validChildrenContent || fallbackData || "";
  const language = detectLanguage(children);

  // If the output file is a CSV let the user download it.
  const getContentToDownload: GetContentToDownloadFunction | undefined =
    language === "csv"
      ? async () => {
          return {
            content: text,
            filename: `dust_output_${Date.now()}`,
            type: "text/csv",
          };
        }
      : undefined;

  const { isValidMermaid, showMermaid, setIsValidMermaid, setShowMermaid } =
    useMermaidDisplay();

  useEffect(() => {
    if (isStreaming || !validChildrenContent || isValidMermaid || showMermaid) {
      return;
    }

    void mermaid
      .parse(validChildrenContent)
      .then(() => {
        setIsValidMermaid(true);
        setShowMermaid(true);
      })
      .catch(() => {
        setIsValidMermaid(false);
        setShowMermaid(false);
      });
  }, [
    isStreaming,
    isValidMermaid,
    showMermaid,
    setIsValidMermaid,
    setShowMermaid,
    validChildrenContent,
  ]);

  return (
    <pre
      className={classNames(
        "my-2 w-full break-all rounded-lg",
        showMermaid ? "bg-slate-100" : "bg-slate-800"
      )}
    >
      <div className="relative">
        <ContentBlockWrapper
          content={{
            "text/plain": text,
          }}
          getContentToDownload={getContentToDownload}
        >
          <div className="absolute right-2 top-2">
            {(validChildrenContent || fallbackData) && (
              <div className="flex gap-2 align-bottom">
                {isValidMermaid && (
                  <>
                    <div
                      className={classNames(
                        "text-xs",
                        showMermaid ? "text-slate-400" : "text-slate-300"
                      )}
                    >
                      <a
                        onClick={() => setShowMermaid(!showMermaid)}
                        className="cursor-pointer"
                      >
                        {showMermaid ? "See Markdown" : "See Graph"}
                      </a>
                    </div>
                    <IconButton
                      variant="tertiary"
                      size="xs"
                      icon={showMermaid ? WrenchIcon : SparklesIcon}
                      onClick={() => setShowMermaid(!showMermaid)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="overflow-auto pt-8 text-sm">
            {validChildrenContent ? children : fallbackData || children}
          </div>
        </ContentBlockWrapper>
      </div>
    </pre>
  );
}

function UlBlock({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc py-2 pl-8 text-element-800 first:pt-0 last:pb-0">
      {children}
    </ul>
  );
}
function OlBlock({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal py-3 pl-8 text-element-800 first:pt-0 last:pb-0">
      {children}
    </ol>
  );
}
function LiBlock({ children }: { children: React.ReactNode }) {
  return (
    <li className="break-words py-2 text-element-800 first:pt-0 last:pb-0">
      {children}
    </li>
  );
}
function ParagraphBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="whitespace-pre-wrap break-words py-2 text-base font-normal leading-7 text-element-800 first:pt-0 last:pb-0">
      {children}
    </div>
  );
}

function CodeBlockWithExtendedSupport({
  children,
  className,
  inline,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const { isValidMermaid, showMermaid } = useMermaidDisplay();

  const validChildrenContent = String(children).trim();
  if (!inline && isValidMermaid && showMermaid) {
    return <MermaidGraph chart={validChildrenContent} />;
  }

  return (
    <CodeBlock className={className} inline={inline}>
      {children}
    </CodeBlock>
  );
}

export function CodeBlock({
  children,
  className,
  inline,
  wrapLongLines = false,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
  wrapLongLines?: boolean;
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
      wrapLongLines={wrapLongLines}
      className="rounded-lg"
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
    <code className="rounded-lg border-structure-200 bg-structure-100 px-1.5 py-1 text-sm text-amber-600 dark:border-structure-200-dark dark:bg-structure-100-dark dark:text-amber-400">
      {children}
    </code>
  );
}
