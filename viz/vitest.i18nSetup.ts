import type { RenderHookOptions, RenderOptions } from "@testing-library/react";
import type { JSXElementConstructor, ReactNode } from "react";
import { vi } from "vitest";

// Wrap every rendered tree in en-US Lingui and Sparkle providers, composing with any wrapper the
// test passes. A test asserting another locale renders its own `VizI18nProvider` inside.
vi.mock("@testing-library/react", async (importOriginal) => {
  const [
    actual,
    { createElement },
    { setupI18n },
    { I18nProvider },
    { SparkleI18nProvider },
    { messages },
  ] = await Promise.all([
    importOriginal<typeof import("@testing-library/react")>(),
    import("react"),
    import("@lingui/core"),
    import("@lingui/react"),
    import("@dust-tt/sparkle/i18n"),
    import("@viz/locales/en-US/messages"),
  ]);

  const i18n = setupI18n({ locale: "en-US", messages: { "en-US": messages } });

  const withI18n =
    (Wrapper?: JSXElementConstructor<{ children: ReactNode }>) =>
    ({ children }: { children: ReactNode }) =>
      createElement(
        I18nProvider,
        { i18n },
        createElement(SparkleI18nProvider, {
          locale: "en-US",
          children: Wrapper ? createElement(Wrapper, null, children) : children,
        })
      );

  const render = (ui: ReactNode, options?: RenderOptions) =>
    actual.render(ui, { ...options, wrapper: withI18n(options?.wrapper) });

  const renderHook = <Result, Props>(
    callback: (props: Props) => Result,
    options?: RenderHookOptions<Props>
  ) =>
    actual.renderHook(callback, {
      ...options,
      wrapper: withI18n(options?.wrapper),
    });

  return { ...actual, render, renderHook };
});
