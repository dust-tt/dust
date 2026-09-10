import {
  formatWebSearchCitationLink,
  insertWebSearchCitationLinks,
} from "@app/lib/model_constructors/utils/web_search_citation";
import { describe, expect, it } from "vitest";

describe("formatWebSearchCitationLink", () => {
  it("renders a titled source as a markdown link", () => {
    expect(
      formatWebSearchCitationLink({
        title: "FIFA World Cup",
        url: "https://example.com/wc",
      })
    ).toBe(" ([FIFA World Cup](https://example.com/wc))");
  });

  it("escapes brackets that would break out of the link label", () => {
    expect(
      formatWebSearchCitationLink({
        title: "A [bracketed] title",
        url: "https://example.com",
      })
    ).toBe(" ([A \\[bracketed\\] title](https://example.com))");
  });

  it("falls back to the host when the provider reports no title", () => {
    expect(
      formatWebSearchCitationLink({
        title: null,
        url: "https://news.example.com/a/b",
      })
    ).toBe(" ([news.example.com](https://news.example.com/a/b))");
  });

  it("falls back to the raw value when the url does not parse", () => {
    expect(formatWebSearchCitationLink({ title: "  ", url: "not a url" })).toBe(
      " ([not a url](not a url))"
    );
  });
});

describe("insertWebSearchCitationLinks", () => {
  it("returns the text untouched when there are no annotations", () => {
    expect(insertWebSearchCitationLinks("hello", [])).toBe("hello");
  });

  it("splices each link at the end of the span it cites", () => {
    expect(
      insertWebSearchCitationLinks("Argentina won. Messi scored.", [
        { title: "A", url: "https://a.example", endIndex: 14 },
        { title: "B", url: "https://b.example", endIndex: 28 },
      ])
    ).toBe(
      "Argentina won. ([A](https://a.example)) Messi scored. ([B](https://b.example))"
    );
  });

  it("orders by offset regardless of the order annotations arrive in", () => {
    expect(
      insertWebSearchCitationLinks("ab", [
        { title: "second", url: "https://b.example", endIndex: 2 },
        { title: "first", url: "https://a.example", endIndex: 1 },
      ])
    ).toBe("a ([first](https://a.example))b ([second](https://b.example))");
  });

  it("suppresses a link repeated immediately after itself", () => {
    expect(
      insertWebSearchCitationLinks("ab", [
        { title: "T", url: "https://a.example", endIndex: 1 },
        { title: "T", url: "https://a.example", endIndex: 2 },
      ])
    ).toBe("a ([T](https://a.example))b");
  });

  it("keeps a source cited again after a different one", () => {
    expect(
      insertWebSearchCitationLinks("abc", [
        { title: "A", url: "https://a.example", endIndex: 1 },
        { title: "B", url: "https://b.example", endIndex: 2 },
        { title: "A", url: "https://a.example", endIndex: 3 },
      ])
    ).toBe(
      "a ([A](https://a.example))b ([B](https://b.example))c ([A](https://a.example))"
    );
  });

  // A provider offset past the end of the text must not drop the tail.
  it("clamps out-of-range offsets", () => {
    expect(
      insertWebSearchCitationLinks("ab", [
        { title: "T", url: "https://a.example", endIndex: 99 },
      ])
    ).toBe("ab ([T](https://a.example))");
  });
});
