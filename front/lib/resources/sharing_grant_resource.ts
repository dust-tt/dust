import type { AuditAction } from "@app/lib/api/audit/workos_audit";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import {
  ShareableFileModel,
  SharingGrantModel,
} from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SharingGrantType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  FileSharingGrantType,
  SharingGrantTarget,
} from "@app/types/sharing_grants";
import {
  sharingDomainSchema,
  sharingEmailSchema,
} from "@app/types/sharing_grants";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type {
  Attributes,
  FindOptions,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SharingGrantResource
  extends ReadonlyAttributesType<SharingGrantModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SharingGrantResource extends BaseResource<SharingGrantModel> {
  static model: ModelStaticWorkspaceAware<SharingGrantModel> =
    SharingGrantModel;

  constructor(
    _model: ModelStaticWorkspaceAware<SharingGrantModel>,
    blob: Attributes<SharingGrantModel>,
    readonly grantingUser: UserResource | null,
    private readonly file: FileResource
  ) {
    super(SharingGrantModel, blob);
  }

  get sId(): string {
    return makeSId("sharing_grant", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get target(): SharingGrantTarget {
    assert(
      (this.email !== null) !== (this.domain !== null),
      "A sharing grant requires exactly one target"
    );

    if (this.email !== null) {
      return { kind: "email", value: this.email };
    }

    assert(this.domain !== null);
    return { kind: "domain", value: this.domain };
  }

  private static async baseFetch(
    file: FileResource,
    { where, ...options }: FindOptions<SharingGrantModel>
  ): Promise<SharingGrantResource[]> {
    const grants = await this.model.findAll({
      ...options,
      where: { ...where, workspaceId: file.workspaceId },
      include: [
        {
          model: ShareableFileModel,
          attributes: [],
          required: true,
          where: { fileId: file.id, workspaceId: file.workspaceId },
        },
      ],
    });

    return this.fromModels(file, grants, options.transaction ?? undefined);
  }

  /**
   * @cc [owner:flvndvd,label:security] exact-email-or-domain-grant
   * Match only active grants for the exact email or its whole domain.
   * Prefer the email grant when both match.
   */
  static async findForEmail(
    file: FileResource,
    email: string
  ): Promise<SharingGrantResource | null> {
    const parsedEmail = sharingEmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      return null;
    }

    const normalizedEmail = parsedEmail.data;
    const domain = normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
    const where: WhereOptions<SharingGrantModel> = {
      workspaceId: file.workspaceId,
      revokedAt: null,
      [Op.or]: [{ email: normalizedEmail }, { domain }],
    };

    // Note: expiresAt is not enforced here because it cannot be set yet.
    // When grant expiration is implemented, add query clause + index
    // expiresAt: { [Op.or]: [null, { [Op.gt]: new Date() }] }
    const [grant] = await this.baseFetch(file, {
      where,
      order: [["email", "ASC NULLS LAST"]],
      limit: 1,
    });

    return grant ?? null;
  }

  static async listForFile(
    file: FileResource,
    {
      includeRevoked = false,
      transaction,
    }: { includeRevoked?: boolean; transaction?: Transaction } = {}
  ): Promise<SharingGrantResource[]> {
    const where: WhereOptions<SharingGrantModel> = {
      workspaceId: file.workspaceId,
      ...(!includeRevoked && { revokedAt: null }),
    };

    return this.baseFetch(file, {
      where,
      order: [
        ["grantedAt", "DESC"],
        ["id", "DESC"],
      ],
      transaction,
    });
  }

  private static async fromModels(
    file: FileResource,
    grants: SharingGrantModel[],
    transaction?: Transaction
  ): Promise<SharingGrantResource[]> {
    const users = await UserResource.fetchByModelIds(
      [...new Set(removeNulls(grants.map((grant) => grant.grantedBy)))],
      { transaction }
    );
    const usersById = new Map(users.map((user) => [user.id, user]));
    return grants.map(
      (grant) =>
        new this(
          this.model,
          grant.get(),
          grant.grantedBy ? (usersById.get(grant.grantedBy) ?? null) : null,
          file
        )
    );
  }

  /**
   * @cc [owner:flvndvd,label:security;backend] authorized-grant-creation
   * Callers MUST authorize each target before adding grants.
   */
  static async add(
    auth: Authenticator,
    file: FileResource,
    { emails = [], domains = [] }: { emails?: string[]; domains?: string[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<SharingGrantResource[], DustError>> {
    assert(
      auth.getNonNullableWorkspace().id === file.workspaceId,
      "Sharing grant workspace mismatch"
    );

    const parsed = z
      .object({
        emails: sharingEmailSchema.array(),
        domains: sharingDomainSchema.array(),
      })
      .safeParse({ emails, domains });
    if (!parsed.success) {
      return new Err(
        new DustError(
          "invalid_request_error",
          fromError(parsed.error).toString()
        )
      );
    }

    const normalizedEmails = [...new Set(parsed.data.emails)];
    const normalizedDomains = [...new Set(parsed.data.domains)];
    const targets: SharingGrantTarget[] = [
      ...normalizedEmails.map((value) => ({ kind: "email" as const, value })),
      ...normalizedDomains.map((value) => ({ kind: "domain" as const, value })),
    ];
    if (!targets.length) {
      return new Ok([]);
    }

    const shareableFile = await ShareableFileModel.findOne({
      attributes: ["id"],
      where: { fileId: file.id, workspaceId: file.workspaceId },
      transaction,
    });
    assert(shareableFile, "File must be shareable before adding grants");

    const where: WhereOptions<SharingGrantModel> = {
      workspaceId: file.workspaceId,
      shareableFileId: shareableFile.id,
      revokedAt: null,
      [Op.or]: [
        { email: { [Op.in]: normalizedEmails } },
        { domain: { [Op.in]: normalizedDomains } },
      ],
    };
    const existing = await this.model.findAll({
      attributes: ["email", "domain"],
      where,
      transaction,
    });
    const existingTargets = new Set(
      existing.map((grant) =>
        grant.email !== null ? `email:${grant.email}` : `domain:${grant.domain}`
      )
    );
    const missing = targets.filter(
      (target) => !existingTargets.has(`${target.kind}:${target.value}`)
    );
    if (!missing.length) {
      return new Ok([]);
    }

    const user = auth.getNonNullableUser();
    const grantedAt = new Date();
    const created = await this.model.bulkCreate(
      missing.map((target) => ({
        workspaceId: file.workspaceId,
        shareableFileId: shareableFile.id,
        email: target.kind === "email" ? target.value : null,
        domain: target.kind === "domain" ? target.value : null,
        grantedBy: user.id,
        grantedAt,
      })),
      { transaction, ignoreDuplicates: true, returning: true }
    );

    // Another request may insert the same grant after our lookup.
    // ignoreDuplicates skips that insert and returns a row without an id.
    const grants = created
      .filter((grant) => Number.isInteger(grant.id))
      .map((grant) => new this(this.model, grant.get(), user, file));
    const createdEmails = removeNulls(grants.map((grant) => grant.email));
    const createdDomains = removeNulls(grants.map((grant) => grant.domain));
    if (createdEmails.length > 0) {
      this.emitAuditEvent(
        auth,
        file,
        "frame.email_grant_added",
        {
          emails: createdEmails.join(","),
        },
        transaction
      );
    }
    if (createdDomains.length > 0) {
      this.emitAuditEvent(
        auth,
        file,
        "frame.domain_grant_added",
        {
          domains: createdDomains.join(","),
        },
        transaction
      );
    }
    return new Ok(grants);
  }

  private static emitAuditEvent(
    auth: Authenticator,
    file: FileResource,
    action: AuditAction,
    metadata: Record<string, string>,
    transaction?: Transaction
  ): void {
    const emit = () => {
      void emitAuditLogEvent({
        auth,
        action,
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("frame", { sId: file.sId, name: file.fileName }),
        ],
        context: getAuditLogContext(auth),
        metadata: { frame_name: file.fileName, ...metadata },
      });
    };
    // A rolled-back grant must not appear in the audit log.
    if (transaction) {
      transaction.afterCommit(emit);
    } else {
      emit();
    }
  }

  static async fetchById(
    file: FileResource,
    grantId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<SharingGrantResource | null> {
    const parsed = getResourceNameAndIdFromSId(grantId);
    if (
      !parsed ||
      parsed.resourceName !== "sharing_grant" ||
      parsed.workspaceModelId !== file.workspaceId
    ) {
      return null;
    }

    const where: WhereOptions<SharingGrantModel> = {
      id: parsed.resourceModelId,
      workspaceId: file.workspaceId,
    };
    const [grant] = await this.baseFetch(file, {
      where,
      limit: 1,
      transaction,
    });

    return grant ?? null;
  }

  /**
   * @cc [owner:flvndvd,label:security] authorized-grant-revocation
   * Callers MUST authorize revocation. Keep other grants and viewer history intact.
   */
  async revoke(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, DustError>> {
    assert(
      auth.getNonNullableWorkspace().id === this.workspaceId,
      "Sharing grant workspace mismatch"
    );
    const where: WhereOptions<SharingGrantModel> = {
      workspaceId: this.workspaceId,
      revokedAt: null,
    };
    const [count] = await this.update(
      { revokedAt: new Date() },
      transaction,
      where
    );
    if (count === 0) {
      return new Err(
        new DustError("file_not_found", "Sharing grant not found")
      );
    }

    const target = this.target;
    switch (target.kind) {
      case "email":
        SharingGrantResource.emitAuditEvent(
          auth,
          this.file,
          "frame.email_grant_revoked",
          {
            email: target.value,
          },
          transaction
        );
        break;
      case "domain":
        SharingGrantResource.emitAuditEvent(
          auth,
          this.file,
          "frame.domain_grant_revoked",
          {
            domain: target.value,
          },
          transaction
        );
        break;
      default:
        assertNever(target);
    }

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<number> {
    return this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  static async deleteForShareableFile(
    workspace: LightWorkspaceType,
    shareableFileId: ModelId
  ): Promise<number> {
    return this.model.destroy({
      where: { workspaceId: workspace.id, shareableFileId },
    });
  }

  async recordLegacyView({
    transaction,
    viewedAt = new Date(),
  }: {
    transaction?: Transaction;
    viewedAt?: Date;
  } = {}): Promise<void> {
    if (this.email === null) {
      return;
    }

    const where: WhereOptions<SharingGrantModel> = {
      workspaceId: this.workspaceId,
      revokedAt: null,
    };
    await this.update({ lastViewedAt: viewedAt }, transaction, where);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON({
    blockedByPolicy,
  }: {
    blockedByPolicy?: boolean;
  } = {}): FileSharingGrantType {
    return {
      sId: this.sId,
      target: this.target,
      grantedAt: this.grantedAt.getTime(),
      grantedBy: this.grantingUser?.toJSON() ?? null,
      expiresAt: this.expiresAt?.getTime() ?? null,
      revokedAt: this.revokedAt?.getTime() ?? null,
      ...(blockedByPolicy !== undefined && { blockedByPolicy }),
    };
  }

  /**
   * @cc [owner:flvndvd,label:api;backend] legacy-email-grant-shape
   * Legacy sharing responses MUST omit grants without an email and retain a string
   * email field for every serialized grant.
   */
  toLegacyJSON({
    blockedByPolicy,
  }: {
    blockedByPolicy?: boolean;
  } = {}): SharingGrantType | null {
    if (this.email === null) {
      return null;
    }
    return {
      id: this.id,
      email: this.email,
      grantedAt: this.grantedAt.getTime(),
      grantedBy: this.grantingUser?.toJSON() ?? null,
      expiresAt: this.expiresAt?.getTime() ?? null,
      revokedAt: this.revokedAt?.getTime() ?? null,
      lastViewedAt: this.lastViewedAt?.getTime() ?? null,
      ...(blockedByPolicy !== undefined && { blockedByPolicy }),
    };
  }
}
