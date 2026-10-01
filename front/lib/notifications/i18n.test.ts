import {
  getNotificationI18n,
  getNotificationLocale,
} from "@app/lib/notifications/i18n";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { describe, expect, it } from "vitest";

describe("getNotificationLocale", () => {
  it("returns the user's stored locale", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await getNotificationLocale(user.sId, workspace.sId)).toBe("fr-FR");
  });

  it("falls back to the default locale for an unknown subscriber", async () => {
    const workspace = await WorkspaceFactory.basic();

    expect(await getNotificationLocale("usr_unknown", workspace.sId)).toBe(
      "en-US"
    );
    expect(await getNotificationLocale(undefined, workspace.sId)).toBe("en-US");
  });
});

describe("getNotificationI18n", () => {
  it("keeps one instance per locale, independent of the others", async () => {
    const [fr, en] = await Promise.all([
      getNotificationI18n("fr-FR"),
      getNotificationI18n("en-US"),
    ]);

    expect(fr.locale).toBe("fr-FR");
    expect(en.locale).toBe("en-US");
    expect(await getNotificationI18n("fr-FR")).toBe(fr);
  });
});
