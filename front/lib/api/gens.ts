import { Op } from "sequelize";

import { GensTemplateType } from "@app/types/gens";
import { UserType, WorkspaceType } from "@app/types/user";

import { Authenticator } from "../auth";
import { GensTemplate } from "../models";

export async function getGensTemplates(
  auth: Authenticator,
  user: UserType
): Promise<GensTemplateType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const templates = await GensTemplate.findAll({
    where: {
      workspaceId: owner.id,
      [Op.or]: [
        {
          visibility: "workspace",
        },
        {
          userId: user.id,
        },
      ],
    },
    order: [["createdAt", "DESC"]],
  });

  return templates.map((t) => {
    return {
      name: t.name,
      instructions: t.instructions2,
      sId: t.sId,
      color: t.color,
      userId: t.userId,
      visibility: t.visibility,
    };
  });
}

export async function getTemplate(
  auth: Authenticator,
  user: UserType,
  sId: string
): Promise<GensTemplateType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const template = await GensTemplate.findOne({
    where: {
      workspaceId: owner.id,
      [Op.or]: [
        {
          visibility: "workspace",
        },
        {
          userId: user.id,
        },
      ],
      sId: sId,
    },
  });
  if (!template) {
    return null;
  }
  return {
    name: template.name,
    instructions: template.instructions2,
    sId: template.sId,
    color: template.color,
    visibility: template.visibility,
    userId: template.userId,
  };
}

export async function updateTemplate(
  auth: Authenticator,
  template: GensTemplateType
) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (template.visibility == "workspace" || template.visibility == "user") {
    return await GensTemplate.update(
      {
        name: template.name,
        instructions2: template.instructions,
        color: template.color,
        visibility: template.visibility,
      },
      {
        where: {
          workspaceId: owner.id,
          sId: template.sId,
        },
      }
    );
  } else {
    return null;
  }
}

export async function deleteTemplate(owner: WorkspaceType, sId: string) {
  return await GensTemplate.destroy({
    where: {
      workspaceId: owner.id,
      sId: sId,
    },
  });
}
