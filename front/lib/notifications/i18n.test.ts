import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import {
  emailRecipientsFromAddresses,
  isExternalSubscriberId,
} from "@app/lib/notifications/transactional_emails";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { SupportedLocale } from "@app/types/locale";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { describe, expect, it } from "vitest";

async function makeWorkspaceWithLocale(locale: SupportedLocale) {
  const workspace = await WorkspaceFactory.basic();
  await WorkspaceModel.update({ locale }, { where: { id: workspace.id } });
  return workspace;
}

describe("getNotificationLocale", () => {
  it("returns the user's stored locale over the workspace's", async () => {
    const workspace = await makeWorkspaceWithLocale("en-GB");
    const user = await UserFactory.basic();
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await getNotificationLocale(user.sId, workspace.sId)).toBe("fr-FR");
  });

  it("uses the notified workspace's locale, not another workspace of the user", async () => {
    const frWorkspace = await makeWorkspaceWithLocale("fr-FR");
    await makeWorkspaceWithLocale("en-GB");
    const user = await UserFactory.basic();

    expect(await getNotificationLocale(user.sId, frWorkspace.sId)).toBe(
      "fr-FR"
    );
  });

  it("uses the workspace's locale for recipients without a Dust user", async () => {
    const workspace = await makeWorkspaceWithLocale("fr-FR");
    const [external] = await emailRecipientsFromAddresses([
      "someone-outside@example.com",
    ]);

    expect(
      await getNotificationLocale(external.subscriberId, workspace.sId)
    ).toBe("fr-FR");
    expect(await getNotificationLocale("usr_unknown", workspace.sId)).toBe(
      "fr-FR"
    );
    expect(await getNotificationLocale(undefined, workspace.sId)).toBe("fr-FR");
  });

  it("falls back to the default locale for an unknown workspace", async () => {
    expect(await getNotificationLocale(undefined, "w_unknown")).toBe("en-US");
  });
});

describe("emailRecipientsFromAddresses", () => {
  it("targets the Dust user owning the address, an external subscriber otherwise", async () => {
    const user = await UserFactory.basic();
    const [asUser, asExternal] = await emailRecipientsFromAddresses([
      ` ${user.email.toUpperCase()} `,
      "Outsider@Example.com",
    ]);

    expect(asUser.subscriberId).toBe(user.sId);
    expect(asUser.email).toBe(user.email);
    expect(isExternalSubscriberId(asExternal.subscriberId)).toBe(true);
    expect(asExternal.subscriberId).not.toContain("example");
    expect(asExternal.email).toBe("Outsider@Example.com");
    expect(asExternal.firstName).toBeUndefined();

    const [again] = await emailRecipientsFromAddresses([
      "outsider@example.com",
    ]);
    expect(again.subscriberId).toBe(asExternal.subscriberId);
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
