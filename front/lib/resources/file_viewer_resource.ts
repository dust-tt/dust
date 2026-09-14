import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileViewerDailyModel } from "@app/lib/resources/storage/models/file_viewer_daily";
import type { FileViewerType } from "@app/types/file_viewers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";
import { col, fn } from "sequelize";

interface ViewerSummary {
  email: string;
  firstViewedAt: Date;
  lastViewedAt: Date;
  viewedDays: number;
}

// A Resource represents a viewer's aggregate, not an independently mutable daily row.
export class FileViewerResource {
  private constructor(private readonly summary: ViewerSummary) {}

  /**
   * @cc [owner:flvndvd,label:security] authorized-verified-viewer
   * Callers MUST authorize the file access and resolve verifiedEmail from a trusted
   * identity before recording. A viewer record MUST NOT confer access to the file.
   */
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
  static async recordView(
    file: FileResource,
    { verifiedEmail, viewedAt }: { verifiedEmail: string; viewedAt: Date }
  ): Promise<Result<void, Error>> {
    const email = verifiedEmail.trim().toLowerCase();
    const viewedOn = viewedAt.toISOString().slice(0, 10);

    try {
      const where = {
        workspaceId: file.workspaceId,
        fileId: file.id,
        email,
        viewedOn,
      };
      const [dailyView, created] = await FileViewerDailyModel.findOrCreate({
        where,
        defaults: { ...where, firstViewedAt: viewedAt, lastViewedAt: viewedAt },
      });
      if (!created) {
        // Merge against the stored bounds so concurrent views cannot overwrite each other.
        await dailyView.update({
          firstViewedAt: fn("LEAST", col("firstViewedAt"), viewedAt),
          lastViewedAt: fn("GREATEST", col("lastViewedAt"), viewedAt),
        });
      }
      return new Ok(undefined);
    } catch (error) {
      // Database failures are handled by the caller without denying file access.
      return new Err(normalizeError(error));
    }
  }

  /**
   * @cc [owner:flvndvd,label:security] viewer-summary-read-permission
   * Callers MUST verify permission to manage file sharing before listing viewer
   * emails. A share token or an external viewer session alone is insufficient.
   */
  static async listForFile(file: FileResource): Promise<FileViewerResource[]> {
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
    return rows.map(
      (row) =>
        new FileViewerResource({
          email: row.email,
          firstViewedAt: row.firstViewedAt,
          lastViewedAt: row.lastViewedAt,
          viewedDays: Number(row.get("viewedDays")),
        })
    );
  }

  static async deleteAllForFile(
    file: FileResource,
    { transaction }: { transaction: Transaction }
  ): Promise<number> {
    return FileViewerDailyModel.destroy({
      where: { workspaceId: file.workspaceId, fileId: file.id },
      transaction,
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<number> {
    return FileViewerDailyModel.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  toJSON(): FileViewerType {
    return {
      email: this.summary.email,
      firstViewedAt: this.summary.firstViewedAt.getTime(),
      lastViewedAt: this.summary.lastViewedAt.getTime(),
      viewedDays: this.summary.viewedDays,
    };
  }
}
