import { WebCrawlerConfigurationResourceFactory } from "@connectors/tests/utils/WebCrawlerConfigurationFactory";
import { describe, expect, test } from "vitest";

import { shouldCrawlLink, stableIdForUrl } from "./utils";

describe("shouldCrawlLink", () => {
  const baseConfig = WebCrawlerConfigurationResourceFactory.createMock();

  describe("Domain and path validation", () => {
    test("should return true for links on the same domain", () => {
      const link = "https://example.com/about";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });

    test("should return true for child paths of config URL", () => {
      const link = "https://example.com/blog/post-1";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });

    test("should return false for different domains", () => {
      const link = "https://different-domain.com/blog";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(false);
    });

    test("should handle relative URLs correctly", () => {
      // This would be resolved relative to baseConfig.url in the actual function
      const link = "https://example.com/blog/category/post";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });
  });

  describe("Depth limitations", () => {
    test("should return true when current depth + 1 is less than config depth", () => {
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });

    test("should return false when depth exceeds WEBCRAWLER_MAX_DEPTH", () => {
      const link = "https://example.com/blog/post/foo/bar/hello/foor";
      const deepConfig = WebCrawlerConfigurationResourceFactory.createMock({
        depth: 5,
      });
      const result = shouldCrawlLink(link, deepConfig);
      expect(result).toBe(false);
    });
  });

  describe("Crawl mode restrictions", () => {
    test('should return true for child paths when crawlMode is "child"', () => {
      const childConfig = WebCrawlerConfigurationResourceFactory.createMock({
        crawlMode: "child",
      });
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, childConfig);
      expect(result).toBe(true);
    });

    test('should return false for non-child paths when crawlMode is "child"', () => {
      const childConfig = WebCrawlerConfigurationResourceFactory.createMock({
        crawlMode: "child",
      });
      const link = "https://example.com/about"; // Not a child of /blog
      const result = shouldCrawlLink(link, childConfig);
      expect(result).toBe(false);
    });

    test('should return true for same domain paths when crawlMode is not "child"', () => {
      const link = "https://example.com/about"; // Not a child but same domain
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });
  });

  describe("Edge cases and combinations", () => {
    test("should return false when domain matches but depth exceeds limits", () => {
      const link = "https://example.com/blog/post/foo/bar";
      const result = shouldCrawlLink(link, baseConfig); // Depth exceeds
      expect(result).toBe(false);
    });

    test("should return false when path is child but domain is different", () => {
      const link = "https://different.com/blog/post"; // Child path but wrong domain
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(false);
    });

    test("should return false when all conditions fail", () => {
      const childConfig = WebCrawlerConfigurationResourceFactory.createMock({
        crawlMode: "child",
      });
      const link = "https://different.com/about"; // Wrong domain, not child, wrong mode
      const result = shouldCrawlLink(link, childConfig); // Depth also exceeds
      expect(result).toBe(false);
    });

    test("should return true when all conditions pass", () => {
      const childConfig = WebCrawlerConfigurationResourceFactory.createMock({
        crawlMode: "child",
      });
      const link = "https://example.com/blog/post"; // Right domain, is child
      const result = shouldCrawlLink(link, childConfig);
      expect(result).toBe(true);
    });

    test("should handle URLs with query parameters correctly", () => {
      const link = "https://example.com/blog/post?id=123&sort=asc";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });

    test("should handle URLs with hash fragments correctly", () => {
      const link = "https://example.com/blog/post#section1";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });
  });

  describe("Subdomain handling", () => {
    test("should return false for different subdomains", () => {
      const link = "https://subdomain.example.com/blog";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(false);
    });
  });

  describe("URL path normalization", () => {
    test("should handle trailing slashes correctly", () => {
      const configWithTrailingSlash =
        WebCrawlerConfigurationResourceFactory.createMock({
          url: "https://example.com/blog/",
        });

      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, configWithTrailingSlash);
      expect(result).toBe(true);
    });

    test("should handle double slashes in paths correctly", () => {
      const link = "https://example.com/blog//post";
      const result = shouldCrawlLink(link, baseConfig);
      expect(result).toBe(true);
    });
  });
});

describe("stableIdForUrl", () => {
  // These expected values are computed with sha256 and serve as regression tests.
  // If the hash function is replaced, these tests will fail, signaling that all
  // persisted document IDs would become inconsistent.

  test("generates a stable hex id for a document URL", () => {
    const id = stableIdForUrl({
      url: "https://example.com/page",
      ressourceType: "document",
    });
    expect(id).toBe(
      "0a27ab9f1e20977651ac525a454216aa9cdb9c10aa83f2431886da1e8d9cb46f"
    );
  });

  test("generates a stable hex id for a folder URL", () => {
    const id = stableIdForUrl({
      url: "https://example.com",
      ressourceType: "folder",
    });
    expect(id).toBe(
      "91454800df973a62898c31983f4eb8151eeee4e14cf4c8542372f3d2b76fe7fd"
    );
  });

  test("generates a stable hex id for a table URL", () => {
    const id = stableIdForUrl({
      url: "https://example.com/data",
      ressourceType: "table",
    });
    expect(id).toBe(
      "1567a8d6cc0c6b8e298db39ac378162647029ea40db05a0ec106319332003879"
    );
  });

  test("returns the same id for the same input on repeated calls", () => {
    const id1 = stableIdForUrl({
      url: "https://example.com/foo",
      ressourceType: "document",
    });
    const id2 = stableIdForUrl({
      url: "https://example.com/foo",
      ressourceType: "document",
    });
    expect(id1).toBe(id2);
  });

  test("returns different ids for different URLs", () => {
    const id1 = stableIdForUrl({
      url: "https://example.com/foo",
      ressourceType: "document",
    });
    const id2 = stableIdForUrl({
      url: "https://example.com/bar",
      ressourceType: "document",
    });
    expect(id1).not.toBe(id2);
  });

  test("returns different ids for different resource types with the same URL", () => {
    const id1 = stableIdForUrl({
      url: "https://example.com",
      ressourceType: "document",
    });
    const id2 = stableIdForUrl({
      url: "https://example.com",
      ressourceType: "folder",
    });
    expect(id1).not.toBe(id2);
  });
});
