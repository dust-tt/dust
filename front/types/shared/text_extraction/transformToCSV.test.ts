import { transformStreamToCSV } from "@app/types/shared/text_extraction/transformToCSV";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";

async function collectChunks(stream: Readable): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("transformStreamToCSV", () => {
  it("emits rows batched into chunks of at least 64 KB", async () => {
    const rowCount = 20_000;
    const html =
      "<html><body><h1>Sheet1</h1><table>" +
      Array.from(
        { length: rowCount },
        (_, i) => `<tr><td>row ${i}</td><td>value</td></tr>`
      ).join("") +
      "</table></body></html>";

    const chunks = await collectChunks(
      transformStreamToCSV(Readable.from([html]), "h1")
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(rowCount / 100);
    for (const chunk of chunks.slice(0, -1)) {
      expect(Buffer.byteLength(chunk)).toBeGreaterThanOrEqual(64 * 1024);
    }

    const lines = chunks.join("").split("\n");
    expect(lines[0]).toBe("TABLE:Sheet1");
    expect(lines[1]).toBe("row 0,value");
    expect(lines[rowCount]).toBe(`row ${rowCount - 1},value`);
  });
});
