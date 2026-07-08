import { ContentBlockWrapper } from "@sparkle/components/markdown/ContentBlockWrapper";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import React, { memo, type ReactNode, useMemo } from "react";

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

interface TableBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const TableBlock = memo(
  ({ children }: TableBlockProps) => {
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
        innerClassName="relative my-2 w-full border border-border rounded-2xl"
        content={tableData}
      >
        <ScrollArea
          scrollContainment="horizontal"
          className="w-full rounded-2xl"
        >
          <table className="w-full">{children}</table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </ContentBlockWrapper>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
TableBlock.displayName = "TableBlock";

interface TableHeadBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const TableHeadBlock = memo(
  ({ children }: TableHeadBlockProps) => {
    return <thead className="bg-muted-background px-2 py-2">{children}</thead>;
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
TableHeadBlock.displayName = "TableHeadBlock";

interface TableBodyBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const TableBodyBlock = memo(
  ({ children }: TableBodyBlockProps) => {
    return <tbody className="bg-background">{children}</tbody>;
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
TableBodyBlock.displayName = "TableBodyBlock";

interface TableHeaderBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const TableHeaderBlock = memo(
  ({ children }: TableHeaderBlockProps) => {
    return (
      <th className="truncate whitespace-nowrap break-words py-3.5 pl-4 text-left text-xs font-semibold text-muted-foreground">
        {children}
      </th>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
TableHeaderBlock.displayName = "TableHeaderBlock";

interface TableDataBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const TableDataBlock = memo(
  ({ children }: TableDataBlockProps) => {
    return (
      <td className="px-4 py-3 text-sm text-foreground">
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
TableDataBlock.displayName = "TableDataBlock";
