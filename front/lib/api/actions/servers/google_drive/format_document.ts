import type { docs_v1 } from "googleapis";

/**
 * Formats a Google Docs document structure into readable markdown.
 * Extracts key information like text content, tables, and indices while
 * limiting verbosity for better LLM consumption.
 *
 * @param doc - The Google Docs document to format
 * @param offset - Element index to start from (for pagination)
 * @param limit - Maximum number of elements to return (0 = no limit)
 */
export function formatDocumentStructure(
  doc: docs_v1.Schema$Document,
  offset: number = 0,
  limit: number = 100
): string {
  const lines: string[] = [];

  lines.push(`# Document: ${doc.title ?? "Untitled"}`);
  lines.push(`Document ID: ${doc.documentId}`);
  lines.push("");

  // Body content
  let hasMore = false;
  let endIndex = 0;

  if (doc.body?.content) {
    const totalElements = doc.body.content.length;
    const effectiveLimit = limit === 0 ? totalElements : limit;
    endIndex = Math.min(offset + effectiveLimit, totalElements);
    hasMore = endIndex < totalElements;

    lines.push("## Document Structure");
    lines.push(
      `Showing elements ${offset} to ${endIndex - 1} of ${totalElements} total`
    );
    lines.push("");

    const elementsToShow = doc.body.content.slice(offset, endIndex);

    elementsToShow.forEach((element) => {
      const start = element.startIndex;
      const end = element.endIndex;

      if (element.paragraph) {
        const para = element.paragraph;
        lines.push(`### Paragraph [${start}-${end}]`);

        if (para.elements) {
          para.elements.forEach((elem) => {
            if (elem.textRun?.content) {
              const text = elem.textRun.content.replace(/\n/g, "\\n");
              lines.push(
                `- Text (${elem.startIndex}-${elem.endIndex}): "${text}"`
              );
            }
          });
        }
        lines.push("");
      } else if (element.table) {
        const table = element.table;
        lines.push(`### Table [${start}-${end}]`);
        lines.push(`- Rows: ${table.rows}`);
        lines.push(`- Columns: ${table.columns}`);

        if (table.tableRows) {
          table.tableRows.forEach((row, rowIdx) => {
            lines.push(`  - Row ${rowIdx}:`);
            row.tableCells?.forEach((cell, colIdx) => {
              const cellStart = cell.startIndex;
              const cellEnd = cell.endIndex;
              const insertIndex = cellStart != null ? cellStart + 1 : undefined;
              lines.push(
                `    - Cell[${rowIdx},${colIdx}]: boundaries (${cellStart}-${cellEnd}), insert at index ${insertIndex}`
              );

              // Extract cell text content
              const cellTexts: string[] = [];
              cell.content?.forEach((cellElement) => {
                cellElement.paragraph?.elements?.forEach((elem) => {
                  if (elem.textRun?.content && elem.textRun.content.trim()) {
                    cellTexts.push(elem.textRun.content.trim());
                  }
                });
              });
              if (cellTexts.length > 0) {
                lines.push(`      Content: "${cellTexts.join(" ")}"`);
              }
            });
          });
        }
        lines.push("");
      } else if (element.sectionBreak) {
        lines.push(`### Section Break [${start}-${end}]`);
        lines.push("");
      }
    });
  }

  lines.push("---");
  lines.push(
    "*Note: Indices shown are character positions in the document. Cell boundaries are shown as (startIndex-endIndex). " +
      "To insert text into a cell, use startIndex + 1. For example, to insert into Cell (4-6), use index 5.*"
  );

  if (hasMore) {
    lines.push("");
    lines.push(
      `*To retrieve more elements, call get_document_structure again with offset=${endIndex}*`
    );
  }

  return lines.join("\n");
}
