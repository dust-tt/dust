// Viewer history query implementation for FileResource.
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileViewerDailyModel } from "@app/lib/resources/storage/models/file_viewer_daily";
import { formatDateFromMillis } from "@app/types/shared/utils/date_utils";
import type { Transaction, WhereOptions } from "sequelize";
import { col, fn } from "sequelize";

// Aggregate projection for one email across the file's daily viewer rows.
export interface FileViewerSummary {
  email: string;
  firstViewedAt: Date;
  lastViewedAt: Date;
  // Number of UTC calendar days with recorded views.
  viewedDays: number;
}

/**
 * @cc [owner:flvndvd,label:backend;concurrency] daily-observation-bounds
 * The UTC day MUST come from viewedAt. Concurrent or out-of-order observations
 * for the same file, normalized email and day MUST preserve the earliest first
 * timestamp and latest last timestamp. Repeating an observation adds no day.
 */
/**
 * @cc [owner:flvndvd,label:backend;performance] daily-view-sequence-use
 * Repeat observations for an existing daily row MUST NOT advance its ID sequence.
 * Concurrent attempts to create a missing row may consume extra IDs.
 */
export async function recordFileView(
  file: FileResource,
  { verifiedEmail, viewedAt }: { verifiedEmail: string; viewedAt: Date }
): Promise<void> {
  const email = verifiedEmail.trim().toLowerCase();
  const viewedOn = formatDateFromMillis(viewedAt.getTime(), "UTC");

  const where: WhereOptions<FileViewerDailyModel> = {
    workspaceId: file.workspaceId,
    fileId: file.id,
    email,
    viewedOn,
  };
  const [dailyView, created] = await FileViewerDailyModel.findOrCreate({
    where,
    defaults: {
      workspaceId: file.workspaceId,
      fileId: file.id,
      email,
      viewedOn,
      firstViewedAt: viewedAt,
      lastViewedAt: viewedAt,
    },
  });
  if (!created) {
    // Merge against the stored bounds so concurrent views cannot overwrite each other.
    await dailyView.update({
      firstViewedAt: fn("LEAST", col("firstViewedAt"), viewedAt),
      lastViewedAt: fn("GREATEST", col("lastViewedAt"), viewedAt),
    });
  }
}

export async function getFileViewerSummaries(
  file: FileResource
): Promise<FileViewerSummary[]> {
  const rows = await FileViewerDailyModel.findAll({
    where: { workspaceId: file.workspaceId, fileId: file.id },
    attributes: [
      "email",
      [fn("MIN", col("firstViewedAt")), "firstViewedAt"],
      [fn("MAX", col("lastViewedAt")), "lastViewedAt"],
      [fn("COUNT", col("id")), "viewedDays"],
    ],
    group: ["email"],
    order: [
      ["lastViewedAt", "DESC"],
      ["email", "ASC"],
    ],
  });
  return rows.map((row) => ({
    email: row.email,
    firstViewedAt: row.firstViewedAt,
    lastViewedAt: row.lastViewedAt,
    viewedDays: Number(row.get("viewedDays")),
  }));
}

export async function deleteFileViews(
  file: FileResource,
  { transaction }: { transaction: Transaction }
): Promise<number> {
  return FileViewerDailyModel.destroy({
    where: { workspaceId: file.workspaceId, fileId: file.id },
    transaction,
  });
}

export async function deleteFileViewsForWorkspace(
  auth: Authenticator
): Promise<number> {
  return FileViewerDailyModel.destroy({
    where: { workspaceId: auth.getNonNullableWorkspace().id },
  });
}
