import type { AppType } from "@dust-tt/types";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { App } from "@app/lib/resources/storage/models/apps";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import { VaultResource } from "@app/lib/resources/vault_resource";

export async function getApp(
  auth: Authenticator,
  aId: string
): Promise<AppType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const app = await App.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private"],
          },
          sId: aId,
        }
      : {
          workspaceId: owner.id,
          visibility: ["public"],
          sId: aId,
        },
    include: [
      { model: VaultModel, as: "vault", include: [{ model: GroupModel }] },
    ],
  });

  if (!app) {
    return null;
  }

  return {
    id: app.id,
    sId: app.sId,
    name: app.name,
    description: app.description,
    visibility: app.visibility,
    savedSpecification: app.savedSpecification,
    savedConfig: app.savedConfig,
    savedRun: app.savedRun,
    dustAPIProjectId: app.dustAPIProjectId,
    vault: VaultResource.fromModel(app.vault).toJSON(),
  };
}

export async function getApps(auth: Authenticator): Promise<AppType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const apps = await App.findAll({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private"],
          },
        }
      : {
          workspaceId: owner.id,
          visibility: "public",
        },
    include: [
      { model: VaultModel, as: "vault", include: [{ model: GroupModel }] },
    ],

    order: [["updatedAt", "DESC"]],
  });

  return apps.map((app) => {
    return {
      id: app.id,
      sId: app.sId,
      name: app.name,
      description: app.description,
      visibility: app.visibility,
      savedSpecification: app.savedSpecification,
      savedConfig: app.savedConfig,
      savedRun: app.savedRun,
      dustAPIProjectId: app.dustAPIProjectId,
      vault: VaultResource.fromModel(app.vault).toJSON(),
    };
  });
}
