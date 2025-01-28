/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { ReactNode, useMemo } from "react";

import { ScrollArea, ScrollBar } from "@sparkle/components";
import { ContentBlockWrapper } from "@sparkle/components/markdown/ContentBlockWrapper";
import { cn } from "@sparkle/lib/utils";

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

export function TableBlock({ children }: { children: React.ReactNode }) {
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
      innerClassName={cn(
        "s-relative",
        "s-my-2",
        "s-w-full",
        "s-border s-border-border-darkMode",
        "s-rounded-2xl"
      )}
      content={tableData}
    >
      <ScrollArea className={cn(
        "s-w-full",
        "s-rounded-2xl"
      )}>
        <table className="s-w-full">{children}</table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </ContentBlockWrapper>
  );
}

export function TableHeadBlock({ children }: { children: React.ReactNode }) {
  return (
    <thead className={cn(
      "s-bg-muted-background dark:s-bg-muted-background-darkMode",
      "s-px-2 s-py-2"
    )}>{children}</thead>
  );
}

export function TableBodyBlock({ children }: { children: React.ReactNode }) {
  return <tbody className={cn(
    "s-bg-white dark:s-bg-structure-50-darkMode"
  )}>{children}</tbody>;
}

export function TableHeaderBlock({ children }: { children: React.ReactNode }) {
  return (
    <th className={cn(
      "s-truncate s-whitespace-nowrap s-break-words",
      "s-py-3.5 s-pl-4",
      "s-text-left s-text-xs s-font-medium s-uppercase s-tracking-wider",
      "s-text-muted-foreground dark:s-text-muted-foreground-darkMode"
    )}>
      {children}
    </th>
  );
}

export function TableDataBlock({ children }: { children: React.ReactNode }) {
  return (
    <td className={cn(
      "s-px-4 s-py-3",
      "s-text-sm",
      "s-text-foreground dark:s-text-foreground-darkMode"
    )}>
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
