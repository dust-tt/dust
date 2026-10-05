import {
  DEFAULT_CONVERSATIONS_SLIDING_WINDOW,
  IntercomArticleModel,
  IntercomCollectionModel,
  IntercomHelpCenterModel,
} from "@connectors/lib/models/intercom";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { describe, expect, it } from "vitest";

import {
  revokeSyncCollection,
  revokeSyncHelpCenter,
} from "./help_center_permissions";

const SHARED_HELP_CENTER_ID = "hc-shared";
const LEVEL1_COLLECTION_ID = "col-l1";
const LEVEL2_COLLECTION_ID = "col-l2";
const LEVEL3_COLLECTION_ID = "col-l3";
const ARTICLE_ID = "article-shared";

async function makeIntercomConnector(suffix: string) {
  return ConnectorResource.makeNew(
    "intercom",
    {
      connectionId: `intercom-conn-${suffix}`,
      workspaceAPIKey: `key-${suffix}`,
      workspaceId: `workspace-${suffix}`,
      dataSourceId: `ds-${suffix}`,
    },
    {
      intercomWorkspaceId: `iw-${suffix}`,
      name: `Workspace ${suffix}`,
      region: "US",
      conversationsSlidingWindow: DEFAULT_CONVERSATIONS_SLIDING_WINDOW,
      syncAllConversations: "disabled",
      shouldSyncNotes: true,
    }
  );
}

async function seedSelectedHelpCenter({
  connectorId,
  intercomWorkspaceId,
}: {
  connectorId: ModelId;
  intercomWorkspaceId: string;
}) {
  await IntercomHelpCenterModel.create({
    connectorId,
    intercomWorkspaceId,
    helpCenterId: SHARED_HELP_CENTER_ID,
    name: "Help Center",
    identifier: "help-center",
    websiteTurnedOn: true,
    permission: "read",
  });

  await IntercomCollectionModel.bulkCreate([
    {
      connectorId,
      intercomWorkspaceId,
      collectionId: LEVEL1_COLLECTION_ID,
      helpCenterId: SHARED_HELP_CENTER_ID,
      parentId: null,
      name: "Level 1",
      url: "https://intercom.example/l1",
      permission: "read",
    },
    {
      connectorId,
      intercomWorkspaceId,
      collectionId: LEVEL2_COLLECTION_ID,
      helpCenterId: SHARED_HELP_CENTER_ID,
      parentId: LEVEL1_COLLECTION_ID,
      name: "Level 2",
      url: "https://intercom.example/l2",
      permission: "read",
    },
    {
      connectorId,
      intercomWorkspaceId,
      collectionId: LEVEL3_COLLECTION_ID,
      helpCenterId: SHARED_HELP_CENTER_ID,
      parentId: LEVEL2_COLLECTION_ID,
      name: "Level 3",
      url: "https://intercom.example/l3",
      permission: "read",
    },
  ]);

  await IntercomArticleModel.create({
    connectorId,
    intercomWorkspaceId,
    articleId: ARTICLE_ID,
    title: "Shared article",
    url: "https://intercom.example/article",
    authorId: "author-1",
    parentId: LEVEL3_COLLECTION_ID,
    parentType: "collection",
    parents: [LEVEL1_COLLECTION_ID, LEVEL2_COLLECTION_ID, LEVEL3_COLLECTION_ID],
    state: "published",
    permission: "read",
  });
}

async function permissionsFor(connectorId: ModelId) {
  const [helpCenter, collections, article] = await Promise.all([
    IntercomHelpCenterModel.findOne({
      where: { connectorId, helpCenterId: SHARED_HELP_CENTER_ID },
    }),
    IntercomCollectionModel.findAll({
      where: { connectorId, helpCenterId: SHARED_HELP_CENTER_ID },
      order: [["collectionId", "ASC"]],
    }),
    IntercomArticleModel.findOne({
      where: { connectorId, articleId: ARTICLE_ID },
    }),
  ]);

  return {
    helpCenter: helpCenter?.permission,
    collections: collections.map((collection) => collection.permission),
    article: article?.permission,
  };
}

describe("Intercom help center permission revocation", () => {
  it("revokeSyncHelpCenter only clears the calling connector", async () => {
    const attacker = await makeIntercomConnector("attacker-hc");
    const victim = await makeIntercomConnector("victim-hc");
    await seedSelectedHelpCenter({
      connectorId: attacker.id,
      intercomWorkspaceId: "iw-attacker-hc",
    });
    await seedSelectedHelpCenter({
      connectorId: victim.id,
      intercomWorkspaceId: "iw-victim-hc",
    });

    await revokeSyncHelpCenter({
      connectorId: attacker.id,
      helpCenterId: SHARED_HELP_CENTER_ID,
    });

    expect(await permissionsFor(attacker.id)).toEqual({
      helpCenter: "none",
      collections: ["none", "none", "none"],
      article: "none",
    });
    expect(await permissionsFor(victim.id)).toEqual({
      helpCenter: "read",
      collections: ["read", "read", "read"],
      article: "read",
    });
  });

  it("revokeSyncCollection only clears the calling connector, including nested rows", async () => {
    const attacker = await makeIntercomConnector("attacker-col");
    const victim = await makeIntercomConnector("victim-col");
    await seedSelectedHelpCenter({
      connectorId: attacker.id,
      intercomWorkspaceId: "iw-attacker-col",
    });
    await seedSelectedHelpCenter({
      connectorId: victim.id,
      intercomWorkspaceId: "iw-victim-col",
    });

    const revoked = await revokeSyncCollection({
      connectorId: attacker.id,
      collectionId: LEVEL1_COLLECTION_ID,
    });

    expect(revoked?.collectionId).toBe(LEVEL1_COLLECTION_ID);
    // The victim still has this help center selected. That must not keep the
    // attacker's help center selected, and must not be revoked with it.
    expect(await permissionsFor(attacker.id)).toEqual({
      helpCenter: "none",
      collections: ["none", "none", "none"],
      article: "none",
    });
    expect(await permissionsFor(victim.id)).toEqual({
      helpCenter: "read",
      collections: ["read", "read", "read"],
      article: "read",
    });
  });
});
