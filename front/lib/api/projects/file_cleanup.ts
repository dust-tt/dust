import { MessageModel } from "@app/lib/models/agent/conversation";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

export async function cleanupProjectFileFragments({
  fileModelId,
  spaceModelId,
  workspaceModelId,
}: {
  fileModelId: ModelId;
  spaceModelId: ModelId;
  workspaceModelId: ModelId;
}): Promise<void> {
  const fragmentModelIds = await ContentFragmentModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      spaceId: spaceModelId,
      fileId: fileModelId,
    },
  }).then((rows) => rows.map(({ id }) => id));
  if (fragmentModelIds.length === 0) {
    return;
  }

  const messages = await MessageModel.findAll({
    attributes: ["contentFragmentId"],
    where: {
      workspaceId: workspaceModelId,
      contentFragmentId: { [Op.in]: fragmentModelIds },
    },
  });
  const referencedModelIds = new Set(
    removeNulls(messages.map(({ contentFragmentId }) => contentFragmentId))
  );
  const orphanModelIds = fragmentModelIds.filter(
    (id) => !referencedModelIds.has(id)
  );

  if (orphanModelIds.length > 0) {
    await ContentFragmentModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        id: { [Op.in]: orphanModelIds },
      },
    });
  }
  if (referencedModelIds.size > 0) {
    await ContentFragmentModel.update(
      { spaceId: null, expiredReason: "file_deleted" },
      {
        where: {
          workspaceId: workspaceModelId,
          id: { [Op.in]: [...referencedModelIds] },
        },
      }
    );
  }
}
