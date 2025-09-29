/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { memo, ReactNode, useMemo } from "react";

import { ScrollArea, ScrollBar } from "@sparkle/components";
import { ContentBlockWrapper } from "@sparkle/components/markdown/ContentBlockWrapper";

import { MarkdownNode } from "./types";
import { sameNodePosition } from "./utils";

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

export const MemoTableBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
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

      const headCells = headNode.props.children[0].props.children.map(
        (c: any) => getNodeText(c.props.children)
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
        innerClassName="s-relative s-my-2 s-w-full s-border s-border-border dark:s-border-border-night s-rounded-2xl"
        content={tableData}
      >
        <ScrollArea className="s-w-full s-rounded-2xl">
          <table className="s-w-full">{children}</table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </ContentBlockWrapper>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoTableBlock.displayName = "TableBlock";

export const MemoTableHeadBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
    return (
      <thead className="s-bg-muted-background s-px-2 s-py-2 dark:s-bg-muted-background-night">
        {children}
      </thead>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoTableHeadBlock.displayName = "TableHeadBlock";

export const MemoTableBodyBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
    return (
      <tbody className="s-bg-white dark:s-bg-background-night">
        {children}
      </tbody>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoTableBodyBlock.displayName = "TableBodyBlock";

export const MemoTableHeaderBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
    return (
      <th className="s-truncate s-whitespace-nowrap s-break-words s-py-3.5 s-pl-4 s-text-left s-text-xs s-font-semibold s-text-muted-foreground dark:s-text-muted-foreground-night">
        {children}
      </th>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoTableHeaderBlock.displayName = "TableHeaderBlock";

export const MemoTableDataBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
    return (
      <td className="s-px-4 s-py-3 s-text-sm s-text-foreground dark:s-text-foreground-night">
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
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoTableDataBlock.displayName = "TableDataBlock";
