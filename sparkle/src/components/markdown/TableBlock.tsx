/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { ReactNode, useMemo } from "react";

import { ContentBlockWrapper } from "@sparkle/components/markdown/ContentBlockWrapper";

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
      className="s-border s-border-structure-200 dark:s-border-structure-200-dark"
      content={tableData}
    >
      <table className="s-w-full s-table-auto">{children}</table>
    </ContentBlockWrapper>
  );
}

export function TableHeadBlock({ children }: { children: React.ReactNode }) {
  return (
    <thead className="s-bg-structure-50 s-px-2 s-py-2 dark:s-bg-structure-50-dark">
      {children}
    </thead>
  );
}

export function TableBodyBlock({ children }: { children: React.ReactNode }) {
  return <tbody className="s-bg-white">{children}</tbody>;
}

export function TableHeaderBlock({ children }: { children: React.ReactNode }) {
  return (
    <th className="s-whitespace-nowrap s-px-6 s-py-3 s-text-left s-text-xs s-font-semibold s-uppercase s-tracking-wider s-text-element-700 dark:s-text-element-700-dark">
      {children}
    </th>
  );
}

export function TableDataBlock({ children }: { children: React.ReactNode }) {
  return (
    <td className="s-px-6 s-py-4 s-text-sm s-text-element-800 dark:s-text-element-800-dark">
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
