import { formatReconcileResult } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_reconcile";
import { describe, expect, it } from "vitest";

describe("formatReconcileResult", () => {
  it("renders a first claim with the applied statements", () => {
    const out = formatReconcileResult({
      database: "chat",
      created: true,
      statements: ["CREATE TABLE `messages` (...)"],
    });

    expect(out).toContain('Database "chat" created.');
    expect(out).toContain("- CREATE TABLE `messages` (...)");
  });

  it("renders an in-sync reconcile with no statements", () => {
    const out = formatReconcileResult({
      database: "chat",
      created: false,
      statements: [],
    });

    expect(out).toContain('Database "chat" reconciled.');
    expect(out).toContain("No schema changes to apply.");
  });

  it("reports the app-qualified name the database was reconciled under", () => {
    const out = formatReconcileResult({
      database: "myapp__chat",
      created: true,
      statements: [],
    });

    expect(out).toContain('Database "myapp__chat" created.');
  });
});
