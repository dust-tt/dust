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
import { visit } from "unist-util-visit";

import type { GetContentToDownloadFunction } from "@app/components/assistant/markdown/ContentBlockWrapper";
import { ContentBlockWrapper } from "@app/components/assistant/markdown/ContentBlockWrapper";
import type { MarkdownCitation } from "@app/components/assistant/markdown/MarkdownCitation";
import { classNames } from "@app/lib/utils";

const supportedDirectives = ["mention", "cite", "visualization"];

const VISUALIZATION_MAGIC_LINE = "{/** visualization-complete */}";

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

function visualizationDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name === "visualization") {
        const data = node.data || (node.data = {});
        data.hName = "visualization";
        data.hProperties = {
          position: node.position,
        };
      }
    });
  };
}

function showUnsupportedDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.type === "textDirective") {
        if (!supportedDirectives.includes(node.name)) {
          // it's not a valid directive, so we'll leave it as plain text
          node.type = "text";
          node.value = `:${node.name}${node.children ? node.children.map((c: any) => c.value).join("") : ""}`;
        }
      }
    });
  };
}

function sanitizeContent(str: string): string {
  // (1) Add closing backticks if they are missing such that we render a code block or inline
  // element during streaming.

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

  const lines = str.split("\n");

  let openVisualization = false;
  for (let i = 0; i < lines.length; i++) {
    // (2) Replace legacy <visualization> XML tags by the markdown directive syntax for backward
    // compatibility with older <visualization> tags.
    if (lines[i].trim() === "<visualization>") {
      lines[i] = ":::visualization";
    }
    if (lines[i].trim() === "</visualization>") {
      lines[i] = ":::";
    }

    // (3) Prepend closing visualization markdow directive with a magic word to detect that the
    // visualization is complete solely based on its content during token streaming.
    if (lines[i].trim().startsWith(":::visualization")) {
      openVisualization = true;
    }
    if (openVisualization && lines[i].trim() === ":::") {
      lines.splice(i, 0, VISUALIZATION_MAGIC_LINE);
      openVisualization = false;
    }
  }

  return lines.join("\n");
}

type CitationsContextType = {
  references: {
    [key: string]: MarkdownCitation;
  };
  updateActiveReferences: (doc: MarkdownCitation, index: number) => void;
  setHoveredReference: (index: number | null) => void;
};

export const CitationsContext = React.createContext<CitationsContextType>({
  references: {},
  updateActiveReferences: () => null,
  setHoveredReference: () => null,
});

export const MarkDownContentContext = React.createContext<{
  content: string;
  isStreaming: boolean;
  isLastMessage: boolean;
}>({
  content: "",
  isStreaming: false,
  isLastMessage: false,
});

export type CustomRenderers = {
  visualization: (
    code: string,
    complete: boolean,
    lineStart: number
  ) => React.JSX.Element;
};

export function RenderMessageMarkdown({
  content,
  isStreaming,
  citationsContext,
  textSize,
  textColor,
  isLastMessage,
  additionalMarkdownComponents,
}: {
  content: string;
  isStreaming: boolean;
  citationsContext?: CitationsContextType;
  textSize?: "sm" | "base";
  textColor?: string;
  isLastMessage: boolean;
  additionalMarkdownComponents?: Components;
}) {
  const processedContent = useMemo(() => sanitizeContent(content), [content]);

  // Note on re-renderings. A lot of effort has been put into preventing rerendering across markdown
  // AST parsing rounds (happening at each token being streamed).
  //
  // When adding a new directive and associated component that depends on external data (eg
  // workspace or message), you can use the customRenderer.visualization pattern. It is essential
  // for the customRenderer argument to be memoized to avoid re-renderings through the
  // markdownComponents memoization dependency on `customRenderer`.
  //
  // Make sure to spend some time understanding the re-rendering or lack thereof through the parser
  // rounds.
  //
  // Minimal test whenever editing this code: ensure that code block content of a streaming message
  // can be selected without blinking.

  // Memoize markdown components to avoid unnecessary re-renders that disrupt text selection
  const markdownComponents: Components = useMemo(
    () => ({
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
      a: LinkBlock,
      ul: UlBlock,
      ol: OlBlock,
      li: ({ children }) => (
        <LiBlock textSize={textSize} textColor={textColor}>
          {children}
        </LiBlock>
      ),
      p: ({ children }) => (
        <ParagraphBlock textSize={textSize} textColor={textColor}>
          {children}
        </ParagraphBlock>
      ),
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
      ...additionalMarkdownComponents,
    }),
    [textSize, textColor, additionalMarkdownComponents]
  );

  const markdownPlugins: PluggableList = useMemo(
    () => [
      remarkDirective,
      mentionDirective,
      visualizationDirective,
      citeDirective(),
      remarkGfm,
      [remarkMath, { singleDollarTextMath: false }],
      showUnsupportedDirective,
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
        <MarkDownContentContext.Provider
          value={{ content: processedContent, isStreaming, isLastMessage }}
        >
          {/* <MermaidDisplayProvider> */}
          <ReactMarkdown
            linkTarget="_blank"
            components={markdownComponents}
            remarkPlugins={markdownPlugins}
            rehypePlugins={
              [[rehypeKatex, { output: "mathml" }]] as PluggableList
            }
          >
            {processedContent}
          </ReactMarkdown>
          {/* </MermaidDisplayProvider> */}
        </MarkDownContentContext.Provider>
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
          const link = document.href;

          return (
            <sup key={`${r.ref}-${i}`}>
              <a
                href={link ?? undefined}
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

    const bodyRows = bodyNode.props.children.map((row: any) =>
      row.props.children.map((cell: any) => {
        const children = cell.props.children;
        return (Array.isArray(children) ? children : [children])
          .map((child: any) =>
            child?.type?.name === "CiteBlock" ? "" : getNodeText(child)
          )
          .join("");
      })
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
          return <React.Fragment key={i}>{child}</React.Fragment>;
        })
      ) : (
        <>{children}</>
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

function PreBlock({ children }: { children: React.ReactNode }) {
  const validChildrenContent =
    Array.isArray(children) && children[0]
      ? children[0].props.children[0]
      : null;

  // Sometimes the children are not valid, but the meta data is
  let fallbackData: string | null = null;
  if (!validChildrenContent) {
    fallbackData =
      Array.isArray(children) && children[0]
        ? children[0].props?.node?.data?.meta
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

  return (
    <pre
      className={classNames("my-2 w-full break-all rounded-lg bg-slate-800")}
    >
      <div className="relative">
        <ContentBlockWrapper
          content={{
            "text/plain": text,
          }}
          getContentToDownload={getContentToDownload}
        >
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
    <ul className="list-disc py-2 pl-8 first:pt-0 last:pb-0">{children}</ul>
  );
}
function OlBlock({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal py-3 pl-8 first:pt-0 last:pb-0">{children}</ol>
  );
}
function LiBlock({
  textSize,
  textColor,
  children,
}: {
  textSize?: string;
  textColor?: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={classNames(
        "break-words first:pt-0 last:pb-0",
        textSize === "sm" ? "py-1" : "py-2",
        textColor ? textColor : "text-element-800"
      )}
    >
      {children}
    </li>
  );
}
function ParagraphBlock({
  textSize,
  textColor,
  children,
}: {
  textSize?: string;
  textColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={classNames(
        "whitespace-pre-wrap break-words font-normal first:pt-0 last:pb-0",
        textSize === "sm" ? "py-1 text-sm" : "py-2 text-base leading-7",
        textColor ? textColor : "text-element-800"
      )}
    >
      {children}
    </div>
  );
}
