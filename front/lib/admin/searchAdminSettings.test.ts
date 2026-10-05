import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";
import { describe, expect, it } from "vitest";

const INDEX: AdminSettingEntry[] = [
  {
    label: "Single Sign-On (SSO)",
    pageId: "security",
    sectionId: "sso",
    keywords: "workos saml oidc",
  },
  {
    label: "Create agents",
    pageId: "governance",
    sectionId: "agents",
    keywords: "agent builder permission",
  },
  {
    label: "Voice transcription",
    pageId: "governance",
    sectionId: "features",
    keywords: "dictation conversations",
  },
];

const pageLabel = (id: string) =>
  id === "governance" ? "Governance" : "Security";

describe("searchAdminSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(searchAdminSettings(INDEX, "  ", pageLabel)).toEqual([]);
  });

  it("matches labels and ranks label hits above keyword-only hits", () => {
    const results = searchAdminSettings(INDEX, "agent", pageLabel);
    expect(results.map((r) => r.label)).toEqual(["Create agents"]);
  });

  it("matches keywords when the label does not contain the token", () => {
    const results = searchAdminSettings(INDEX, "saml", pageLabel);
    expect(results.map((r) => r.label)).toEqual(["Single Sign-On (SSO)"]);
  });

  it("requires every query token to match", () => {
    expect(searchAdminSettings(INDEX, "sso billing", pageLabel)).toEqual([]);
  });

  it("matches page labels in the haystack", () => {
    const results = searchAdminSettings(INDEX, "governance voice", pageLabel);
    expect(results.map((r) => r.label)).toEqual(["Voice transcription"]);
  });
});
