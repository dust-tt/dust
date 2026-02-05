import type { docs_v1 } from "googleapis";

/**
 * Formats a Google Docs document structure into readable markdown.
 * Extracts key information like text content, tables, and indices while
 * limiting verbosity for better LLM consumption.
 */
export function formatDocumentStructure(doc: docs_v1.Schema$Document): string {
  const lines: string[] = [];

  lines.push(`# Document: ${doc.title ?? "Untitled"}`);
  lines.push(`Document ID: ${doc.documentId}`);
  lines.push("");

  // Body content
  if (doc.body?.content) {
    lines.push("## Document Structure");
    lines.push("");

    doc.body.content.forEach((element) => {
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
              lines.push(
                `    - Cell[${rowIdx},${colIdx}] (${cellStart}-${cellEnd})`
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
    "*Note: Indices shown are character positions in the document for use with update_document batch requests.*"
  );

  return lines.join("\n");
}
