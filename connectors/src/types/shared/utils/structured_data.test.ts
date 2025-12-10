import * as Path from "node:path";

import fs from "fs";
import { describe, expect, it } from "vitest";

import { decodeBuffer } from "@connectors/connectors/shared/file";

import { parseAndStringifyCsv } from "./structured_data";

describe("parseAndStringifyCsv", () => {
  it("should parse and stringify a single line CSV", async () => {
    const result = await parseAndStringifyCsv(
      '"Last name"\t"First name"\t"Email"\t"Program session"\t"Path session"\t"Course"\t"Score"\t"Progress"\t"Start"\t"End"\t"Total time spent"'
    );

    expect(result).toBe(
      `Last name,First name,Email,Program session,Path session,Course,Score,Progress,Start,End,Total time spent
`
    );
  });

  it("should parse and stringify a comma-separated CSV", async () => {
    const csv = `name,age,city
Alice,30,Paris
Bob,25,London`;

    const result = await parseAndStringifyCsv(csv);

    expect(result).toBe(`name,age,city
Alice,30,Paris
Bob,25,London
`);
  });

  it("should parse and stringify a semicolon-separated CSV", async () => {
    const csv = `name;age;city
Alice;30;Paris
Bob;25;London`;

    const result = await parseAndStringifyCsv(csv);

    expect(result).toBe(`name,age,city
Alice,30,Paris
Bob,25,London
`);
  });

  it("should parse and stringify a tab-separated CSV", async () => {
    const csv = `name\tage\tcity
Alice\t30\tParis
Bob\t25\tLondon`;

    const result = await parseAndStringifyCsv(csv);

    expect(result).toBe(`name,age,city
Alice,30,Paris
Bob,25,London
`);
  });

  it("should handle UTF-16 encoded CSV with BOM", async () => {
    const fileContent = fs.readFileSync(
      Path.join(__dirname, "test_data", "utf16.csv"),
      "utf-16le"
    );
    const result = await parseAndStringifyCsv(fileContent);

    // The BOM is removed
    expect(result).toBe(`name,age,city
Alice,30,Paris
`);
  });

  it("should handle UTF-16 encoded CSV with BOM with readBuffer", async () => {
    const buffer = fs.readFileSync(
      Path.join(__dirname, "test_data", "utf16.csv")
    );

    const result = await parseAndStringifyCsv(
      decodeBuffer(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        )
      )
    );

    // The BOM is removed
    expect(result).toBe(`name,age,city
Alice,30,Paris
`);
  });

  it("should handle UTF-16 encoded CSV with semicolon delimiter", async () => {
    // Create a UTF-16LE encoded CSV with semicolon delimiter
    const csvContent = `name;age;city
Alice;30;Paris
Bob;25;London`;

    const utf16Buffer = Buffer.from("\uFEFF" + csvContent, "utf16le");
    const utf16String = utf16Buffer.toString("utf16le");

    const result = await parseAndStringifyCsv(utf16String);

    // Should convert to comma-separated, BOM is preserved
    expect(result).toBe(`name,age,city
Alice,30,Paris
Bob,25,London
`);
  });

  it("should skip empty lines", async () => {
    const csv = `name,age,city

Alice,30,Paris

Bob,25,London

`;

    const result = await parseAndStringifyCsv(csv);

    expect(result).toBe(`name,age,city
Alice,30,Paris
Bob,25,London
`);
  });

  it("should handle CSV with quoted fields", async () => {
    const csv = `name,age,city
"Alice, Jr.",30,"Paris, France"
"Bob",25,"London, UK"`;

    const result = await parseAndStringifyCsv(csv);

    expect(result).toBe(`name,age,city
"Alice, Jr.",30,"Paris, France"
Bob,25,"London, UK"
`);
  });
});
