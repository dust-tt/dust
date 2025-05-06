import { describe, expect, test } from "vitest";

import { shouldCrawlLink } from "./utils";

describe("shouldCrawlLink", () => {
  // Base configuration for tests
  const baseConfig = {
    url: "https://example.com/blog",
    depth: 3,
    crawlMode: "website",
  };

  describe("Domain and path validation", () => {
    test("should return true for links on the same domain", () => {
      const link = "https://example.com/about";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });

    test("should return true for child paths of config URL", () => {
      const link = "https://example.com/blog/post-1";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });

    test("should return false for different domains", () => {
      const link = "https://different-domain.com/blog";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(false);
    });

    test("should handle relative URLs correctly", () => {
      // This would be resolved relative to baseConfig.url in the actual function
      const link = "https://example.com/blog/category/post";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });
  });

  describe("Depth limitations", () => {
    test("should return true when current depth + 1 is less than config depth", () => {
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, baseConfig, 1); // 1 + 1 < 3
      expect(result).toBe(true);
    });

    test("should return false when current depth + 1 equals config depth", () => {
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, baseConfig, 2); // 2 + 1 = 3
      expect(result).toBe(false);
    });

    test("should return false when current depth + 1 exceeds config depth", () => {
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, baseConfig, 3); // 3 + 1 > 3
      expect(result).toBe(false);
    });

    test("should return false when current depth + 1 equals WEBCRAWLER_MAX_DEPTH", () => {
      const link = "https://example.com/blog/post";
      const deepConfig = { ...baseConfig, depth: 10 }; // Higher than WEBCRAWLER_MAX_DEPTH
      const result = shouldCrawlLink(link, deepConfig, 4); // 4 + 1 = 5 (WEBCRAWLER_MAX_DEPTH)
      expect(result).toBe(false);
    });

    test("should return false when current depth + 1 exceeds WEBCRAWLER_MAX_DEPTH", () => {
      const link = "https://example.com/blog/post";
      const deepConfig = { ...baseConfig, depth: 10 };
      const result = shouldCrawlLink(link, deepConfig, 5); // 5 + 1 > 5
      expect(result).toBe(false);
    });
  });

  describe("Crawl mode restrictions", () => {
    test('should return true for child paths when crawlMode is "child"', () => {
      const childConfig = { ...baseConfig, crawlMode: "child" };
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, childConfig, 0);
      expect(result).toBe(true);
    });

    test('should return false for non-child paths when crawlMode is "child"', () => {
      const childConfig = { ...baseConfig, crawlMode: "child" };
      const link = "https://example.com/about"; // Not a child of /blog
      const result = shouldCrawlLink(link, childConfig, 0);
      expect(result).toBe(false);
    });

    test('should return true for same domain paths when crawlMode is not "child"', () => {
      const allConfig = { ...baseConfig, crawlMode: "website" };
      const link = "https://example.com/about"; // Not a child but same domain
      const result = shouldCrawlLink(link, allConfig, 0);
      expect(result).toBe(true);
    });
  });

  describe("Edge cases and combinations", () => {
    test("should return false when domain matches but depth exceeds limits", () => {
      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, baseConfig, 3); // Depth exceeds
      expect(result).toBe(false);
    });

    test("should return false when path is child but domain is different", () => {
      const link = "https://different.com/blog/post"; // Child path but wrong domain
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(false);
    });

    test("should return false when all conditions fail", () => {
      const childConfig = { ...baseConfig, crawlMode: "child" };
      const link = "https://different.com/about"; // Wrong domain, not child, wrong mode
      const result = shouldCrawlLink(link, childConfig, 4); // Depth also exceeds
      expect(result).toBe(false);
    });

    test("should return true when all conditions pass", () => {
      const childConfig = { ...baseConfig, crawlMode: "child" };
      const link = "https://example.com/blog/post"; // Right domain, is child
      const result = shouldCrawlLink(link, childConfig, 0); // Depth is fine
      expect(result).toBe(true);
    });

    test("should handle URLs with query parameters correctly", () => {
      const link = "https://example.com/blog/post?id=123&sort=asc";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });

    test("should handle URLs with hash fragments correctly", () => {
      const link = "https://example.com/blog/post#section1";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });
  });

  describe("Subdomain handling", () => {
    test("should return false for different subdomains", () => {
      const link = "https://subdomain.example.com/blog";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(false);
    });
  });

  describe("URL path normalization", () => {
    test("should handle trailing slashes correctly", () => {
      const configWithTrailingSlash = {
        ...baseConfig,
        url: "https://example.com/blog/",
      };

      const link = "https://example.com/blog/post";
      const result = shouldCrawlLink(link, configWithTrailingSlash, 0);
      expect(result).toBe(true);
    });

    test("should handle double slashes in paths correctly", () => {
      const link = "https://example.com/blog//post";
      const result = shouldCrawlLink(link, baseConfig, 0);
      expect(result).toBe(true);
    });
  });
});
