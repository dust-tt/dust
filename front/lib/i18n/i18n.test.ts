import { loadCatalog } from "@app/lib/i18n/i18n";
import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { describe, expect, it } from "vitest";

describe("loadCatalog", () => {
  it("renders the en-US message where the en-GB catalog has no translation", async () => {
    const descriptor = msg`Language`;
    const messages = await loadCatalog("en-GB");
    expect(messages[descriptor.id]).toBeDefined();

    const enGb = setupI18n({
      locale: "en-GB",
      messages: { "en-GB": messages },
    });
    expect(enGb._(descriptor)).toBe("Language");
  });
});
