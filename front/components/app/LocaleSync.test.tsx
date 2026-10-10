import { LocaleSync } from "@app/components/app/LocaleSync";
import { formatNumber, setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { setLocaleOverride } from "@app/lib/i18n/locale_override";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_ACTIVE: true,
}));

describe("LocaleSync", () => {
  beforeEach(async () => {
    setFormatLocale(undefined);
    setLocaleOverride(null);
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));
    document.documentElement.lang = "fr-FR";
  });

  it("activates the default locale when there is no locale", async () => {
    render(<LocaleSync locale={null} />);

    await waitFor(() => expect(i18n.locale).toBe("en-US"));
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("formats in the browser locale when there is no locale", async () => {
    setFormatLocale("fr-FR");

    render(<LocaleSync locale={null} />);

    await waitFor(() => expect(i18n.locale).toBe("en-US"));
    expect(formatNumber(1234.5)).toBe((1234.5).toLocaleString());
  });

  it("activates the locale override when there is no locale", async () => {
    setLocaleOverride("fr-FR");
    const messages = await loadCatalog("en-US");
    act(() => i18n.loadAndActivate({ locale: "en-US", messages }));

    render(<LocaleSync locale={null} />);

    await waitFor(() => expect(i18n.locale).toBe("fr-FR"));
    expect(formatNumber(1234.5)).toBe("1 234,5");
  });

  it("calls onReady once the default locale is active", async () => {
    const localesAtReady: string[] = [];

    render(
      <LocaleSync
        locale={null}
        onReady={() => localesAtReady.push(i18n.locale)}
      />
    );

    await waitFor(() => expect(localesAtReady).toEqual(["en-US"]));
  });
});
