import { createHash } from "crypto";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceVerificationAttemptModel } from "@app/lib/resources/storage/models/workspace_verification_attempt";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import type { VerificationStatus } from "@app/types/workspace_verification";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceVerificationAttemptResource extends ReadonlyAttributesType<WorkspaceVerificationAttemptModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceVerificationAttemptResource extends BaseResource<WorkspaceVerificationAttemptModel> {
  static model: ModelStaticWorkspaceAware<WorkspaceVerificationAttemptModel> =
    WorkspaceVerificationAttemptModel;

  constructor(
    model: ModelStaticWorkspaceAware<WorkspaceVerificationAttemptModel>,
    blob: Attributes<WorkspaceVerificationAttemptModel>
  ) {
    super(WorkspaceVerificationAttemptModel, blob);
  }

  get sId(): string {
    return makeSId("workspace_verification_attempt", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get status(): VerificationStatus {
    if (this.verifiedAt) {
      return "verified";
    }
    return "pending";
  }

  static hashPhoneNumber(phoneNumber: string): string {
    return createHash("sha256").update(phoneNumber).digest("hex");
  }

  static async isPhoneAlreadyUsed(phoneNumberHash: string): Promise<boolean> {
    const existing = await this.model.findOne({
      where: { phoneNumberHash },
      // WORKSPACE_ISOLATION_BYPASS: Global uniqueness check - a phone can only be used by one workspace.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    return existing !== null;
  }

  static async makeNew(
    auth: Authenticator,
    {
      phoneNumberHash,
      twilioVerificationSid,
    }: {
      phoneNumberHash: string;
      twilioVerificationSid: string;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<WorkspaceVerificationAttemptResource> {
    const attempt = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        phoneNumberHash,
        twilioVerificationSid,
        attemptNumber: 1,
      },
      { transaction }
    );

    return new this(this.model, attempt.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<WorkspaceVerificationAttemptModel>
  ): Promise<WorkspaceVerificationAttemptResource[]> {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  static async fetchByPhoneHash(
    auth: Authenticator,
    phoneNumberHash: string
  ): Promise<WorkspaceVerificationAttemptResource | null> {
    const [row] = await this.baseFetch(auth, {
      where: { phoneNumberHash },
    });
    return row ?? null;
  }

  static async hasVerifiedPhone(auth: Authenticator): Promise<boolean> {
    const rows = await this.baseFetch(auth, {
      where: { verifiedAt: { [Op.ne]: null } },
      limit: 1,
    });
    return rows.length > 0;
  }

  async recordNewAttempt(
    twilioVerificationSid: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.update(
      {
        twilioVerificationSid,
        attemptNumber: this.attemptNumber + 1,
      },
      transaction
    );
  }

  async markVerified({
    transaction,
  }: { transaction?: Transaction } = {}): Promise<void> {
    if (this.verifiedAt) {
      throw new Error("Verification attempt already marked as verified");
    }
    await this.update({ verifiedAt: new Date() }, transaction);
  }

  toLogJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      phoneNumberHash: this.phoneNumberHash,
      attemptNumber: this.attemptNumber,
      status: this.status,
      verifiedAt: this.verifiedAt?.toISOString() ?? null,
    };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await WorkspaceVerificationAttemptModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    await WorkspaceVerificationAttemptModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }
}
