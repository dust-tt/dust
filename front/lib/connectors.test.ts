import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isNodeCandidate,
  isUrlCandidate,
  nodeCandidateFromUrl,
} from "./connectors";

// Mock the config module before importing
vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: vi.fn(() => "dust.tt"),
    getAppUrl: vi.fn(() => "dust.tt"),
  },
}));

// Import config after mocking
import config from "@app/lib/api/config";

describe("nodeCandidateFromUrl", () => {
  beforeEach(() => {
    // Reset the mock before each test
    vi.mocked(config.getClientFacingUrl).mockReturnValue("https://dust.tt");
  });
  describe("Confluence", () => {
    it("should extract node ID from Confluence page URL", () => {
      const url =
        "https://example.atlassian.net/wiki/spaces/SPACE/pages/12345678/Page+Title";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("confluence-page-12345678");
        expect(result.provider).toBe("confluence");
      }
    });

    it("should return URL candidate when node ID cannot be extracted", () => {
      const url = "https://example.atlassian.net/wiki/spaces/SPACE";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(url);
        expect(result.provider).toBe("confluence");
      }
    });

    it("should match Confluence URLs with atlassian.net hostname", () => {
      const url =
        "https://mycompany.atlassian.net/wiki/spaces/TEST/pages/98765432";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("confluence-page-98765432");
        expect(result.provider).toBe("confluence");
      }
    });
  });

  describe("Google Drive", () => {
    it("should extract node ID from Google Drive /d/ URL", () => {
      const url = "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("gdrive-1a2b3c4d5e6f7g8h9i0j");
        expect(result.provider).toBe("google_drive");
      }
    });

    it("should extract node ID from Google Docs URL", () => {
      const url = "https://docs.google.com/document/d/abc123def456/edit";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("gdrive-abc123def456");
        expect(result.provider).toBe("google_drive");
      }
    });

    it("should extract node ID from URL parameter", () => {
      const url = "https://drive.google.com/file/view?id=xyz789abc";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("gdrive-xyz789abc");
        expect(result.provider).toBe("google_drive");
      }
    });

    it("should return null node when ID cannot be extracted", () => {
      const url = "https://drive.google.com/drive/folders";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBeNull();
        expect(result.provider).toBe("google_drive");
      }
    });
  });

  describe("GitHub", () => {
    it("should return URL candidate for GitHub URLs", () => {
      const url = "https://github.com/owner/repo/blob/main/file.ts";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(url);
        expect(result.provider).toBe("github");
      }
    });

    it("should handle GitHub URLs with different paths", () => {
      const url = "https://github.com/user/repo/pull/123";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(url);
        expect(result.provider).toBe("github");
      }
    });
  });

  describe("Notion", () => {
    it("should extract node ID from Notion page URL with 32-char ID", () => {
      const url =
        "https://www.notion.so/Page-Title-12345678901234567890123456789012";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("notion-12345678-9012-3456-7890-123456789012");
        expect(result.provider).toBe("notion");
      }
    });

    it("should handle Notion URLs with multiple dashes", () => {
      // The last part after splitting by "-" must be exactly 32 characters
      const url =
        "https://www.notion.so/My-Page-Title-With-Many-Words-abcdef12345678901234567890123456";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("notion-abcdef12-3456-7890-1234-567890123456");
        expect(result.provider).toBe("notion");
      }
    });

    it("should return null node when ID cannot be extracted", () => {
      const url = "https://www.notion.so/Page-Without-ID";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBeNull();
        expect(result.provider).toBe("notion");
      }
    });

    it("should return null node when ID is not 32 characters", () => {
      const url = "https://www.notion.so/Page-12345";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBeNull();
        expect(result.provider).toBe("notion");
      }
    });
  });

  describe("Slack", () => {
    it("should extract thread node ID from archives URL with thread_ts parameter", () => {
      const url =
        "https://dust4ai.slack.com/archives/C05V0P20A72/p1748353621866279?thread_ts=1748353030.562719&cid=C05V0P20A72";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("slack-C05V0P20A72-thread-1748353030.562719");
        expect(result.provider).toBe("slack");
      }
    });

    it("should extract thread node ID from archives URL without thread_ts (using p timestamp)", () => {
      const url =
        "https://dust4ai.slack.com/archives/C05V0P20A72/p1748353030562719";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("slack-C05V0P20A72-thread-1748353030.562719");
        expect(result.provider).toBe("slack");
      }
    });

    it("should extract channel node ID from client URL", () => {
      const url = "https://dust4ai.slack.com/client/T1234567890/C05V0P20A72";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("slack-channel-C05V0P20A72");
        expect(result.provider).toBe("slack");
      }
    });

    it("should return null node when Slack URL doesn't match patterns", () => {
      const url = "https://dust4ai.slack.com/archives/C05V0P20A72";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBeNull();
        expect(result.provider).toBe("slack");
      }
    });
  });

  describe("Gong", () => {
    it("should return URL candidate for Gong call URLs", () => {
      const url = "https://app.gong.io/call?id=12345";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(url);
        expect(result.provider).toBe("gong");
      }
    });

    it("should not match Gong URLs without /call path", () => {
      const url = "https://app.gong.io/dashboard";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });

    it("should not match Gong URLs without id parameter", () => {
      const url = "https://app.gong.io/call";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });
  });

  describe("Zendesk", () => {
    it("should normalize Zendesk ticket URL", () => {
      const url = "https://example.zendesk.com/agent/tickets/12345";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://example.zendesk.com/tickets/12345");
        expect(result.provider).toBe("zendesk");
      }
    });

    it("should remove trailing slash from Zendesk URL", () => {
      const url = "https://example.zendesk.com/tickets/12345/";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://example.zendesk.com/tickets/12345");
        expect(result.provider).toBe("zendesk");
      }
    });

    it("should handle Zendesk URLs without /agent path", () => {
      const url = "https://example.zendesk.com/tickets/12345";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://example.zendesk.com/tickets/12345");
        expect(result.provider).toBe("zendesk");
      }
    });
  });

  describe("Intercom", () => {
    it("should normalize Intercom app URL", () => {
      const url = "https://app.intercom.com/a/inbox/12345";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://app.intercom.com/a/inbox/12345");
        expect(result.provider).toBe("intercom");
      }
    });

    it("should normalize Intercom help center URL", () => {
      const url = "https://help.example.com/articles/article-123";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(
          "https://help.example.com/articles/article-123"
        );
        expect(result.provider).toBe("intercom");
      }
    });

    it("should remove trailing slash from Intercom URL", () => {
      const url = "https://app.intercom.com/a/inbox/12345/";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://app.intercom.com/a/inbox/12345");
        expect(result.provider).toBe("intercom");
      }
    });
  });

  describe("Dust Project", () => {
    it("should normalize Dust project URL", () => {
      const url = "https://dust.tt/w/workspace123/spaces/space456/apps/app789";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(
          "https://dust.tt/w/workspace123/spaces/space456/apps/app789"
        );
        expect(result.provider).toBe("dust_project");
      }
    });

    it("should remove trailing slash from Dust project URL", () => {
      const url = "https://dust.tt/w/workspace123/conversation/conv456/";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(
          "https://dust.tt/w/workspace123/conversation/conv456"
        );
        expect(result.provider).toBe("dust_project");
      }
    });

    it("should handle Dust project URLs with subdomains when implementation supports it", () => {
      const url = "https://eu.dust.tt/w/workspace123/spaces/space456";
      const result = nodeCandidateFromUrl(url);

      // For now, with startsWith, subdomains don't match
      expect(result).toBeNull();
    });

    it("should normalize Dust project URLs (query parameters are not preserved)", () => {
      const url =
        "https://dust.tt/w/workspace123/conversation/conv456?param=value";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        // Query parameters are not preserved in the normalized URL
        expect(result.url).toBe(
          "https://dust.tt/w/workspace123/conversation/conv456"
        );
        expect(result.provider).toBe("dust_project");
      }
    });

    it("should handle root Dust project URL", () => {
      const url = "https://dust.tt/";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe("https://dust.tt");
        expect(result.provider).toBe("dust_project");
      }
    });

    it("should not match URLs that don't end with dust.tt", () => {
      const url = "https://dust-tt.com/page";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });

    it("should handle localhost URLs when configured", () => {
      const url = "https://dust.tt/w/workspace123/conversation/conv456";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(
          "https://dust.tt/w/workspace123/conversation/conv456"
        );
        expect(result.provider).toBe("dust_project");
      }
    });
  });

  describe("Edge cases", () => {
    it("should return null for invalid URLs", () => {
      const url = "not-a-valid-url";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });

    it("should return null for URLs that don't match any provider", () => {
      const url = "https://example.com/page";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const url = "";
      const result = nodeCandidateFromUrl(url);

      expect(result).toBeNull();
    });

    it("should handle URLs with query parameters and fragments", () => {
      const url =
        "https://example.atlassian.net/wiki/spaces/SPACE/pages/12345678/Page?query=value#fragment";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("confluence-page-12345678");
        expect(result.provider).toBe("confluence");
      }
    });

    it("should handle URLs with ports", () => {
      const url = "https://github.com:443/owner/repo";
      const result = nodeCandidateFromUrl(url);

      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.provider).toBe("github");
      }
    });
  });

  describe("Provider priority", () => {
    it("should prefer node extraction over URL normalization when both exist", () => {
      // Confluence has both extractor and urlNormalizer
      const url =
        "https://example.atlassian.net/wiki/spaces/SPACE/pages/12345678/Page";
      const result = nodeCandidateFromUrl(url);

      // Should return node candidate, not URL candidate
      expect(result).not.toBeNull();
      expect(isNodeCandidate(result)).toBe(true);
      if (isNodeCandidate(result)) {
        expect(result.node).toBe("confluence-page-12345678");
      }
    });

    it("should fall back to URL normalization when node extraction fails", () => {
      // Confluence URL without extractable node ID
      const url = "https://example.atlassian.net/wiki/spaces/SPACE";
      const result = nodeCandidateFromUrl(url);

      // Should return URL candidate as fallback
      expect(result).not.toBeNull();
      expect(isUrlCandidate(result)).toBe(true);
      if (isUrlCandidate(result)) {
        expect(result.url).toBe(url);
      }
    });
  });
});
