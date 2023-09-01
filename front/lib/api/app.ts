import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { App } from "@app/lib/models";
import { AppType } from "@app/types/app";

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
            [Op.or]: ["public", "private", "unlisted"],
          },
          sId: aId,
        }
      : {
          workspaceId: owner.id,
          visibility: ["public", "unlisted"],
          sId: aId,
        },
  });

  if (!app) {
    return null;
  }

  return {
    id: app.id,
    sId: app.sId,
    name: app.name,
    description: app.description ?? undefined,
    visibility: app.visibility,
    savedSpecification: app.savedSpecification ?? undefined,
    savedConfig: app.savedConfig ?? undefined,
    savedRun: app.savedRun ?? undefined,
    dustAPIProjectId: app.dustAPIProjectId,
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
            [Op.or]: ["public", "private", "unlisted"],
          },
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
        },
    order: [["updatedAt", "DESC"]],
  });

  return apps.map((app) => {
    return {
      id: app.id,
      sId: app.sId,
      name: app.name,
      description: app.description ?? undefined,
      visibility: app.visibility,
      savedSpecification: app.savedSpecification ?? undefined,
      savedConfig: app.savedConfig ?? undefined,
      savedRun: app.savedRun ?? undefined,
      dustAPIProjectId: app.dustAPIProjectId,
    };
  });
}
