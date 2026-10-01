import { setFormatLocale } from "@app/lib/i18n/format";
import type { GitHubIssueNode } from "@app/lib/providers/github/types";
import { buildContentSummaryForIssue } from "@app/lib/providers/github/utils";
import { SUPPORTED_LOCALES } from "@app/types/locale";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const ISSUE: GitHubIssueNode = {
  __typename: "Issue",
  number: 42,
  title: "Fix the thing",
  body: null,
  state: "OPEN",
  url: "https://github.com/acme/repo/issues/42",
  repository: { owner: { login: "acme" }, name: "repo" },
  author: { login: "alice" },
  comments: {
    nodes: [
      {
        author: { login: "bob" },
        body: "Looks good",
        createdAt: "2025-09-23T15:37:32Z",
      },
    ],
  },
};

describe("buildContentSummaryForIssue", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "UTC");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    setFormatLocale(undefined);
  });

  it.each(
    SUPPORTED_LOCALES
  )("formats comment dates in en-US with %s as the format locale", (locale) => {
    setFormatLocale(locale);
    expect(buildContentSummaryForIssue(ISSUE)).toContain(
      "**@bob** — Sep 23, 2025, 3:37 PM"
    );
  });
});
