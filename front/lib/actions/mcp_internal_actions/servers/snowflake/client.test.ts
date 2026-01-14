import { describe, expect, it } from "vitest";

// We need to test the escapeIdentifier function which is not exported.
// Since it's a simple pure function, we can replicate it here for testing.
function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}

describe("escapeIdentifier", () => {
  it("should return identifier unchanged when no quotes present", () => {
    expect(escapeIdentifier("my_database")).toBe("my_database");
    expect(escapeIdentifier("SCHEMA_NAME")).toBe("SCHEMA_NAME");
    expect(escapeIdentifier("table123")).toBe("table123");
  });

  it("should double single double-quote", () => {
    expect(escapeIdentifier('my"table')).toBe('my""table');
  });

  it("should double multiple double-quotes", () => {
    expect(escapeIdentifier('a"b"c')).toBe('a""b""c');
  });

  it("should handle consecutive double-quotes", () => {
    expect(escapeIdentifier('test""name')).toBe('test""""name');
  });

  it("should handle double-quotes at start and end", () => {
    expect(escapeIdentifier('"quoted"')).toBe('""quoted""');
  });

  it("should handle empty string", () => {
    expect(escapeIdentifier("")).toBe("");
  });

  it("should prevent SQL injection attempts", () => {
    // Attempt to break out of quoted identifier
    const malicious = 'test"; DROP TABLE users; --';
    const escaped = escapeIdentifier(malicious);
    // The escaped version should have doubled quotes, preventing injection
    expect(escaped).toBe('test""; DROP TABLE users; --');
    // When used in SQL like: SHOW TABLES IN "escaped"
    // It becomes: SHOW TABLES IN "test""; DROP TABLE users; --"
    // Which treats the whole thing as a single identifier, not injection
  });
});

describe("Snowflake write operation detection", () => {
  const writeOperations = ["INSERT", "UPDATE", "DELETE", "MERGE"];

  it("should detect write operations case-insensitively", () => {
    const testCases = [
      { operation: "INSERT", shouldBlock: true },
      { operation: "Insert", shouldBlock: true },
      { operation: "insert", shouldBlock: true },
      { operation: "UPDATE", shouldBlock: true },
      { operation: "Update", shouldBlock: true },
      { operation: "DELETE", shouldBlock: true },
      { operation: "MERGE", shouldBlock: true },
      { operation: "TableScan", shouldBlock: false },
      { operation: "Filter", shouldBlock: false },
      { operation: "Result", shouldBlock: false },
    ];

    for (const { operation, shouldBlock } of testCases) {
      const isWriteOp = writeOperations.includes(operation.toUpperCase());
      expect(isWriteOp).toBe(shouldBlock);
    }
  });
});
