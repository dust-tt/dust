import { setupI18n } from "@lingui/core";
import { Plural, Trans } from "@lingui/react/macro";
import { SparkleI18nContext, toI18nContext } from "@sparkle/lib/i18n/useLingui";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Explicit ids so the test can supply translations without going through the catalogs.
function Greeting({ name }: { name: string }) {
  return (
    <p>
      <Trans id="test.greeting">
        Hello <b>{name}</b>, read the <a href="/docs">documentation</a>.
      </Trans>
    </p>
  );
}

function ItemCount({ count }: { count: number }) {
  return <Plural id="test.items" value={count} one="# item" other="# items" />;
}

describe("Trans", () => {
  it("renders the English message without a provider", () => {
    expect(renderToStaticMarkup(<Greeting name="Ada" />)).toBe(
      '<p>Hello <b>Ada</b>, read the <a href="/docs">documentation</a>.</p>'
    );
    expect(renderToStaticMarkup(<ItemCount count={1} />)).toBe("1 item");
    expect(renderToStaticMarkup(<ItemCount count={3} />)).toBe("3 items");
  });

  it("renders in the locale of the nearest sparkle context", () => {
    const i18n = setupI18n();
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: {
        "test.greeting":
          "Bonjour <0>{name}</0>, lisez la <1>documentation</1>.",
        "test.items": "{count, plural, one {# élément} other {# éléments}}",
      },
    });

    const html = renderToStaticMarkup(
      <SparkleI18nContext.Provider value={toI18nContext(i18n)}>
        <Greeting name="Ada" />
        <ItemCount count={3} />
      </SparkleI18nContext.Provider>
    );

    expect(html).toBe(
      '<p>Bonjour <b>Ada</b>, lisez la <a href="/docs">documentation</a>.</p>3 éléments'
    );
  });
});
