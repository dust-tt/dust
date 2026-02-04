import { WebCrawlerConfigurationResourceFactory } from "@connectors/tests/utils/WebCrawlerConfigurationFactory";
import { describe, expect, test } from "vitest";

import { shouldCrawlLink } from "./utils";

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
