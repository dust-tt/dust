import { i18n } from "@app/lib/i18n/i18n";
import { DEFAULT_LOCALE } from "@app/types/locale";
import type { RenderHookOptions, RenderOptions } from "@testing-library/react";
import type { JSXElementConstructor, ReactNode } from "react";
import { afterEach, vi } from "vitest";

// Wrap every rendered tree in the Lingui provider, composing with any wrapper the test passes.
vi.mock("@testing-library/react", async (importOriginal) => {
  const [actual, { createElement }, { I18nProvider }, { i18n }] =
    await Promise.all([
      importOriginal<typeof import("@testing-library/react")>(),
      import("react"),
      import("@lingui/react"),
      import("@app/lib/i18n/i18n"),
    ]);

  const withI18n =
    (Wrapper?: JSXElementConstructor<{ children: ReactNode }>) =>
    ({ children }: { children: ReactNode }) =>
      createElement(
        I18nProvider,
        { i18n },
        Wrapper ? createElement(Wrapper, null, children) : children
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

afterEach(() => {
  i18n.activate(DEFAULT_LOCALE);
});
