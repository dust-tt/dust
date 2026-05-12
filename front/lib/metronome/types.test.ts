import { classifyMetronomePackageByName } from "@app/lib/metronome/types";
import { describe, expect, it } from "vitest";

describe("classifyMetronomePackageByName", () => {
  it("matches the most-specific tier when multiple keywords are present", () => {
    expect(classifyMetronomePackageByName("Enterprise Pro")).toBe("enterprise");
    expect(classifyMetronomePackageByName("Business Pro Plan")).toBe(
      "business"
    );
  });

  it("matches each tier from its keyword", () => {
    expect(classifyMetronomePackageByName("Legacy Pro Monthly")).toBe("pro");
    expect(classifyMetronomePackageByName("Legacy Business")).toBe("business");
    expect(classifyMetronomePackageByName("Enterprise EUR")).toBe("enterprise");
  });

  it("is case-insensitive", () => {
    expect(classifyMetronomePackageByName("PRO PLAN 2027")).toBe("pro");
    expect(classifyMetronomePackageByName("enterprise tier")).toBe(
      "enterprise"
    );
  });

  it("respects word boundaries so substrings don't false-match", () => {
    expect(classifyMetronomePackageByName("Approve plan")).toBeNull();
    expect(classifyMetronomePackageByName("Probusiness")).toBeNull();
    expect(classifyMetronomePackageByName("Enterprises")).toBeNull();
  });

  it("returns null for names without a tier keyword", () => {
    expect(classifyMetronomePackageByName("Starter")).toBeNull();
    expect(classifyMetronomePackageByName("Premium")).toBeNull();
    expect(classifyMetronomePackageByName("")).toBeNull();
  });
});
