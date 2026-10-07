import { i18n } from "@app/lib/i18n/i18n";
import { DEFAULT_LOCALE } from "@app/types/locale";
import type { RenderHookOptions, RenderOptions } from "@testing-library/react";
import type { JSXElementConstructor, ReactNode } from "react";
import { afterEach, vi } from "vitest";

// Wrap every rendered tree in the app's Lingui providers (front's and sparkle's), composing with any
// wrapper the test passes.
vi.mock("@testing-library/react", async (importOriginal) => {
  const [actual, { createElement }, { AppI18nProvider }] = await Promise.all([
    importOriginal<typeof import("@testing-library/react")>(),
    import("react"),
    import("@app/components/app/AppI18nProvider"),
  ]);

  const withI18n =
    (Wrapper?: JSXElementConstructor<{ children: ReactNode }>) =>
    ({ children }: { children: ReactNode }) =>
      createElement(
        AppI18nProvider,
        null,
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
