import { setupI18n } from "@lingui/core";
import { I18nProvider, Trans as ConsumerTrans } from "@lingui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { SparkleI18nContext } from "@sparkle/lib/i18n/useLingui";
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

function Labelled({ children }: { children: React.ReactNode }) {
  return (
    <Trans id="test.labelled">
      Label: {children}
    </Trans>
  );
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
      <SparkleI18nContext.Provider value={{ i18n, _: i18n.t }}>
        <Greeting name="Ada" />
        <ItemCount count={3} />
      </SparkleI18nContext.Provider>
    );

    expect(html).toBe(
      '<p>Bonjour <b>Ada</b>, lisez la <a href="/docs">documentation</a>.</p>3 éléments'
    );
  });

  it("keeps the consumer's context for interpolated consumer elements", () => {
    const consumerI18n = setupI18n();
    consumerI18n.loadAndActivate({
      locale: "fr-FR",
      messages: { "consumer.title": "Titre" },
    });

    const html = renderToStaticMarkup(
      <I18nProvider i18n={consumerI18n}>
        <Labelled>
          <ConsumerTrans id="consumer.title" message="Title" />
        </Labelled>
      </I18nProvider>
    );

    expect(html).toBe("Label: Titre");
  });
});
