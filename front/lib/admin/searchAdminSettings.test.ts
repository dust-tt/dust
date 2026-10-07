import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { describe, expect, it } from "vitest";

const INDEX: AdminSettingEntry[] = [
  {
    label: msg`Single Sign-On (SSO)`,
    pageId: "security",
    sectionId: "sso",
    keywords: msg`workos saml oidc`,
  },
  {
    label: msg`Create agents`,
    pageId: "governance",
    sectionId: "agents",
    keywords: msg`agent builder permission`,
  },
  {
    label: msg`Voice transcription`,
    pageId: "governance",
    sectionId: "features",
    keywords: msg`dictation conversations`,
  },
];

const pageLabel = (id: string) =>
  id === "governance" ? "Governance" : "Security";

const english = (descriptor: MessageDescriptor) => descriptor.message ?? "";

const FRENCH: Record<string, string> = {
  "Create agents": "Créer des agents",
  "agent builder permission": "éditeur d’agents autorisation",
  "Voice transcription": "Transcription vocale",
  "dictation conversations": "dictée conversations",
};

const french = (descriptor: MessageDescriptor) =>
  FRENCH[descriptor.message ?? ""] ?? english(descriptor);

function labels(query: string, t = english) {
  return searchAdminSettings(INDEX, query, pageLabel, t).map(
    (r) => r.label.message
  );
}

describe("searchAdminSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(searchAdminSettings(INDEX, "  ", pageLabel, english)).toEqual([]);
  });

  it("matches labels and ranks label hits above keyword-only hits", () => {
    expect(labels("agent")).toEqual(["Create agents"]);
  });

  it("matches keywords when the label does not contain the token", () => {
    expect(labels("saml")).toEqual(["Single Sign-On (SSO)"]);
  });

  it("requires every query token to match", () => {
    expect(labels("sso billing")).toEqual([]);
  });

  it("matches page labels in the haystack", () => {
    expect(labels("governance voice")).toEqual(["Voice transcription"]);
  });

  it("matches translated labels and keywords, ignoring accents", () => {
    expect(labels("vocale")).toEqual([]);
    expect(labels("vocale", french)).toEqual(["Voice transcription"]);
    expect(labels("editeur", french)).toEqual(["Create agents"]);
  });

  it("keeps matching English labels and keywords in another locale", () => {
    expect(labels("voice", french)).toEqual(["Voice transcription"]);
    expect(labels("builder", french)).toEqual(["Create agents"]);
  });
});
