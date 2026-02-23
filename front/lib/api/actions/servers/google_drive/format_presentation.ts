import type { slides_v1 } from "googleapis";

/**
 * Formats a Google Slides presentation structure into readable markdown.
 * Extracts key information like slides, page elements, text content, and object IDs
 * for making precise updates via the update_presentation tool.
 *
 * @param presentation - The Google Slides presentation to format
 * @param offset - Slide index to start from (for pagination)
 * @param limit - Maximum number of slides to return (0 = no limit)
 */
export function formatPresentationStructure(
  presentation: slides_v1.Schema$Presentation,
  offset: number = 0,
  limit: number = 10
): string {
  const lines: string[] = [];

  lines.push(`# Presentation: ${presentation.title ?? "Untitled"}`);
  lines.push(`Presentation ID: ${presentation.presentationId}`);
  lines.push("");

  // Slides content
  let hasMore = false;
  let endIndex = 0;

  if (presentation.slides) {
    const totalSlides = presentation.slides.length;
    const effectiveLimit = limit === 0 ? totalSlides : limit;
    endIndex = Math.min(offset + effectiveLimit, totalSlides);
    hasMore = endIndex < totalSlides;

    lines.push("## Presentation Structure");
    lines.push(
      `Showing slides ${offset + 1} to ${endIndex} of ${totalSlides} total`
    );
    lines.push("");

    const slidesToShow = presentation.slides.slice(offset, endIndex);

    slidesToShow.forEach((slide, idx) => {
      const slideNumber = offset + idx + 1;
      lines.push(`### Slide ${slideNumber}`);
      lines.push(`- Slide ID: \`${slide.objectId}\``);

      if (slide.slideProperties?.layoutObjectId) {
        lines.push(`- Layout ID: \`${slide.slideProperties.layoutObjectId}\``);
      }

      // Page elements
      if (slide.pageElements && slide.pageElements.length > 0) {
        lines.push(`- Page Elements: ${slide.pageElements.length}`);
        lines.push("");

        slide.pageElements.forEach((element, elemIdx) => {
          if (element.objectId) {
            lines.push(`  **Element ${elemIdx + 1}: \`${element.objectId}\`**`);

            // Shape with text
            if (element.shape) {
              lines.push(`  - Type: Shape`);
              if (element.shape.shapeType) {
                lines.push(`  - Shape Type: ${element.shape.shapeType}`);
              }

              if (element.shape.text?.textElements) {
                const textContent = extractTextContent(
                  element.shape.text.textElements
                );
                if (textContent) {
                  lines.push(`  - Text Content: "${textContent}"`);
                }
                lines.push(
                  `  - Text Indices: Use insertionIndex for insertText operations`
                );
              }
            }

            // Table
            if (element.table) {
              lines.push(`  - Type: Table`);
              lines.push(`  - Rows: ${element.table.rows ?? 0}`);
              lines.push(`  - Columns: ${element.table.columns ?? 0}`);

              if (element.table.tableRows) {
                element.table.tableRows.forEach((row, rowIdx) => {
                  if (row.tableCells && row.tableCells.length > 0) {
                    lines.push(`    - Row ${rowIdx}:`);
                    row.tableCells.forEach((cell, colIdx) => {
                      const cellText = cell.text?.textElements
                        ? extractTextContent(cell.text.textElements)
                        : "";
                      if (cellText) {
                        lines.push(
                          `      - Cell[${rowIdx},${colIdx}]: "${cellText}"`
                        );
                      }
                    });
                  }
                });
              }
              lines.push(
                `  - Table Location: Use {tableObjectId: "${element.objectId}", rowIndex: N, columnIndex: M} for cell operations`
              );
            }

            // Image
            if (element.image) {
              lines.push(`  - Type: Image`);
              if (element.image.contentUrl) {
                lines.push(`  - URL: ${element.image.contentUrl}`);
              }
            }

            // Video
            if (element.video) {
              lines.push(`  - Type: Video`);
              if (element.video.source) {
                lines.push(`  - Source: ${element.video.source}`);
              }
              if (element.video.id) {
                lines.push(`  - Video ID: ${element.video.id}`);
              }
            }

            // Line
            if (element.line) {
              lines.push(`  - Type: Line`);
              if (element.line.lineCategory) {
                lines.push(`  - Category: ${element.line.lineCategory}`);
              }
            }

            // Word Art
            if (element.wordArt) {
              lines.push(`  - Type: WordArt`);
              const wordArtText = element.wordArt.renderedText;
              if (wordArtText) {
                lines.push(`  - Text: "${wordArtText}"`);
              }
            }

            // Group
            if (element.elementGroup) {
              lines.push(`  - Type: Group`);
              const childCount = element.elementGroup.children?.length ?? 0;
              lines.push(`  - Child Elements: ${childCount}`);
            }

            // Sheets Chart
            if (element.sheetsChart) {
              lines.push(`  - Type: Sheets Chart`);
              if (element.sheetsChart.spreadsheetId) {
                lines.push(
                  `  - Spreadsheet ID: ${element.sheetsChart.spreadsheetId}`
                );
              }
              if (element.sheetsChart.chartId) {
                lines.push(`  - Chart ID: ${element.sheetsChart.chartId}`);
              }
            }

            lines.push("");
          }
        });
      } else {
        lines.push("- Page Elements: 0 (empty slide)");
        lines.push("");
      }
    });
  }

  lines.push("---");
  lines.push(
    "*Note: Object IDs shown above are required for most update operations. " +
      "Use these IDs with insertText, deleteObject, updateTextStyle, and other batch update requests.*"
  );

  if (hasMore) {
    lines.push("");
    lines.push(
      `*To retrieve more slides, call get_presentation_structure again with offset=${endIndex}*`
    );
  }

  return lines.join("\n");
}

/**
 * Extracts plain text content from text elements, stripping formatting.
 */
function extractTextContent(
  textElements: slides_v1.Schema$TextElement[]
): string {
  return textElements
    .map((elem) => elem.textRun?.content ?? "")
    .join("")
    .trim()
    .replace(/\n/g, " ");
}
