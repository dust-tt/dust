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

  it("appends the replication warning when the first sync was not confirmed", () => {
    const out = formatReconcileResult({
      database: "chat",
      created: true,
      statements: [],
      replicationWarning: "first replication sync could not be confirmed.",
    });

    expect(out).toContain(
      "Warning: first replication sync could not be confirmed."
    );
  });

  it("emits no warning line by default", () => {
    const out = formatReconcileResult({
      database: "chat",
      created: true,
      statements: [],
    });

    expect(out).not.toContain("Warning:");
  });
});
