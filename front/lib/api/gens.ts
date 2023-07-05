import { Op } from "sequelize";

import { new_id } from "@app/lib/utils";
import { GensTemplateType } from "@app/types/gens";
import { UserType, WorkspaceType } from "@app/types/user";

import { GensTemplate } from "../models";

export async function getGensTemplates(
  owner: WorkspaceType,
  user: UserType
): Promise<GensTemplateType[]> {
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
      instructions: t.instructions,
      sId: t.sId,
      color: t.color,
      userId: t.userId,
      visibility: t.visibility,
    };
  });
}

export async function getTemplate(
  owner: WorkspaceType,
  user: UserType,
  sId: string
): Promise<GensTemplateType | null> {
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
    instructions: template.instructions,
    sId: template.sId,
    color: template.color,
    visibility: template.visibility,
  };
}

export async function updateTemplate(
  template: GensTemplateType,
  owner: WorkspaceType,
  user: UserType,
  isBuilder: boolean
) {
  if (template.visibility == "workspace" || template.visibility == "user") {
    const or_filters = [];
    if (isBuilder) {
      or_filters.push({ workspaceId: owner.id });
    }
    or_filters.push({ userId: user.id });
    return await GensTemplate.update(
      {
        name: template.name,
        instructions: template.instructions,
        color: template.color,
        visibility: template.visibility,
      },
      {
        where: {
          [Op.or]: or_filters,
          sId: template.sId,
        },
      }
    );
  } else {
    return null;
  }
}

export async function deleteTemplate(
  owner: WorkspaceType,
  user: UserType,
  sId: string,
  isBuilder: boolean
) {
  const or_filters = [];
  if (isBuilder) {
    or_filters.push({ workspaceId: owner.id });
  }
  or_filters.push({ userId: user.id });
  return await GensTemplate.destroy({
    where: {
      [Op.or]: or_filters,
      sId: sId,
    },
  });
}

export function newGensTemplateId() {
  const uId = new_id();
  return uId.slice(0, 10);
}
