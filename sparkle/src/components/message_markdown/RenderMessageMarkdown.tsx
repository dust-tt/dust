import type { ReactNode } from "react";
import React, { useContext, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

import { BlockquoteBlock } from "@sparkle/components/message_markdown/BlockquoteBlock";
import {
  CitationsContext,
  CitationsContextType,
  CiteBlock,
  citeDirective,
} from "@sparkle/components/message_markdown/CiteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/message_markdown/CodeBlockWithExtendedSupport";
import {
  ContentBlockWrapper,
  GetContentToDownloadFunction,
} from "@sparkle/components/message_markdown/ContentBlockWrapper";
import { MarkdownContentContext } from "@sparkle/components/message_markdown/MarkdownContentContext";
import {
  MentionBlock,
  mentionDirective,
} from "@sparkle/components/message_markdown/MentionBlock";
import { classNames } from "@sparkle/lib/utils";

const headerColor = "s-text-element-900";
const paragraphSize = "s-text-base";
const headingSize = {
  sm: {
    h1: "s-text-xl s-font-bold",
    h2: "s-text-xl s-font-regular",
    h3: "s-text-lg s-font-bold",
    h4: "s-text-base s-font-bold",
    h5: "s-text-base s-font-medium",
    h6: "s-text-base s-font-bold",
  },
  base: {
    h1: "s-text-5xl s-font-semibold",
    h2: "s-text-4xl s-font-semibold",
    h3: "s-text-2xl s-font-semibold",
    h4: "s-text-lg s-font-bold",
    h5: "s-text-lg s-font-medium",
    h6: "s-text-base s-font-bold",
  },
};
type TextSize = "sm" | "base";

function showUnsupportedDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.type === "textDirective") {
        // it's not a valid directive, so we'll leave it as plain text
        node.type = "text";
        node.value = `:${node.name}${node.children ? node.children.map((c: any) => c.value).join("") : ""}`;
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

  return str;
}

export type CustomRenderers = {
  visualization: (
    code: string,
    complete: boolean,
    lineStart: number
  ) => React.JSX.Element;
};

export function RenderMessageMarkdown({
  content,
  isStreaming = false,
  citationsContext,
  textSize = "base",
  textColor = "s-text-element-800",
  isLastMessage = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}: {
  content: string;
  isStreaming?: boolean;
  citationsContext?: CitationsContextType;
  textSize?: TextSize;
  textColor?: string;
  isLastMessage?: boolean;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
}) {
  const processedContent = useMemo(() => sanitizeContent(content), [content]);
  const [isDarkMode, setIsDarkMode] = useState(true);

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
  const markdownComponents: Components = useMemo(() => {
    return {
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
      a: LinkBlock,
      ul: ({ children }) => <UlBlock textColor={textColor}>{children}</UlBlock>,
      ol: ({ children }) => <OlBlock textColor={textColor}>{children}</OlBlock>,
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
        <h1
          className={classNames(
            "s-pb-2 s-pt-4",
            headingSize[textSize].h1,
            headerColor
          )}
        >
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          className={classNames(
            "s-pb-2 s-pt-4",
            headingSize[textSize].h2,
            headerColor
          )}
        >
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          className={classNames(
            "s-pb-2 s-pt-4",
            headingSize[textSize].h3,
            headerColor
          )}
        >
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4
          className={classNames(
            "s-pb-2 s-pt-3",
            headingSize[textSize].h4,
            headerColor
          )}
        >
          {children}
        </h4>
      ),
      h5: ({ children }) => (
        <h5
          className={classNames(
            "s-pb-1.5 s-pt-2.5",
            headingSize[textSize].h5,
            headerColor
          )}
        >
          {children}
        </h5>
      ),
      h6: ({ children }) => (
        <h6
          className={classNames(
            "s-pb-1.5 s-pt-2.5",
            headingSize[textSize].h6,
            headerColor
          )}
        >
          {children}
        </h6>
      ),
      strong: ({ children }) => (
        <strong className="s-font-semibold s-text-element-900">
          {children}
        </strong>
      ),
      blockquote: BlockquoteBlock,
      hr: () => <div className="s-my-6 s-border-b s-border-structure-200" />,
      mention: MentionBlock,
      code: CodeBlockWithExtendedSupport,
      ...additionalMarkdownComponents,
    };
  }, [textSize, textColor, additionalMarkdownComponents]);

  const markdownPlugins: PluggableList = useMemo(
    () => [
      remarkDirective,
      mentionDirective,
      citeDirective(),
      remarkGfm,
      [remarkMath, { singleDollarTextMath: false }],
      ...(additionalMarkdownPlugins || []),
      showUnsupportedDirective,
    ],
    [additionalMarkdownPlugins]
  );

  return (
    <div
      className={classNames("s-w-full", isStreaming ? "s-blinking-cursor" : "")}
    >
      <CitationsContext.Provider
        value={
          citationsContext || {
            references: {},
            updateActiveReferences: () => null,
            setHoveredReference: () => null,
          }
        }
      >
        <MarkdownContentContext.Provider
          value={{
            content: processedContent,
            isStreaming,
            isLastMessage,
            setIsDarkMode,
            isDarkMode,
          }}
        >
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
        </MarkdownContentContext.Provider>
      </CitationsContext.Provider>
    </div>
  );
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
      className="s-dark:border-structure-200-dark s-border s-border-structure-200"
      content={tableData}
    >
      <table className="s-w-full s-table-auto">{children}</table>
    </ContentBlockWrapper>
  );
}

function TableHeadBlock({ children }: { children: React.ReactNode }) {
  return (
    <thead className="s-dark:bg-structure-50-dark s-bg-structure-50 s-px-2 s-py-2">
      {children}
    </thead>
  );
}

function TableBodyBlock({ children }: { children: React.ReactNode }) {
  return <tbody className="s-bg-white">{children}</tbody>;
}

function TableHeaderBlock({ children }: { children: React.ReactNode }) {
  return (
    <th className="s-dark:text-element-700-dark s-whitespace-nowrap s-px-6 s-py-3 s-text-left s-text-xs s-font-semibold s-uppercase s-tracking-wider s-text-element-700">
      {children}
    </th>
  );
}

function TableDataBlock({ children }: { children: React.ReactNode }) {
  return (
    <td className="s-dark:text-element-800-dark s-px-6 s-py-4 s-text-sm s-text-element-800">
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
      className="s-hover:text-action-400 s-hover:underline s-active:text-action-600 s-break-all s-font-semibold s-text-action-500 s-transition-all s-duration-200 s-ease-in-out"
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
  const { isDarkMode } = useContext(MarkdownContentContext);
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
      className={classNames(
        "s-my-2 s-w-full s-break-all s-rounded-lg",
        isDarkMode ? "s-bg-slate-800" : "s-bg-slate-100"
      )}
    >
      <div className="relative">
        <ContentBlockWrapper
          content={{
            "text/plain": text,
          }}
          getContentToDownload={getContentToDownload}
        >
          <div className="s-overflow-auto s-pt-8 s-text-sm">
            {validChildrenContent ? children : fallbackData || children}
          </div>
        </ContentBlockWrapper>
      </div>
    </pre>
  );
}

function UlBlock({
  children,
  textColor,
}: {
  children: React.ReactNode;
  textColor: string;
}) {
  return (
    <ul
      className={classNames(
        "s-first:pt-0 s-last:pb-0 s-list-disc s-py-2 s-pl-8",
        textColor,
        paragraphSize
      )}
    >
      {children}
    </ul>
  );
}
function OlBlock({
  children,
  textColor,
}: {
  children: React.ReactNode;
  textColor: string;
}) {
  return (
    <ol
      className={classNames(
        "s-first:pt-0 s-last:pb-0 s-list-decimal s-py-3 s-pl-8",
        textColor,
        paragraphSize
      )}
    >
      {children}
    </ol>
  );
}
function LiBlock({
  textSize,
  textColor,
  children,
}: {
  textSize: TextSize;
  textColor: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={classNames(
        "s-first:pt-0 s-last:pb-0 s-break-words",
        textSize === "sm" ? "s-py-1" : "s-py-2",
        textColor,
        paragraphSize
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
  textColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={classNames(
        "s-first:pt-0 s-last:pb-0 s-whitespace-pre-wrap s-break-words s-font-normal",
        textSize === "sm"
          ? "s-py-1 s-text-sm"
          : "s-py-2 s-text-base s-leading-7",
        textColor
      )}
    >
      {children}
    </div>
  );
}
