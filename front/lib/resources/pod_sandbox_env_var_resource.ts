import {
  MAX_VARS_PER_POD,
  normalizeAllowedDomainsForKind,
  renderEgressSecretPlaceholder,
  renderWorkspaceSandboxEnvVarName,
  validateEnvVarName,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import {
  buildSecretSourceFromRow,
  resolveSecretValue,
} from "@app/lib/api/sandbox/secret_source";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { PodSandboxEnvVarModel } from "@app/lib/resources/storage/models/pod_sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type {
  PodSandboxEnvVarType,
  WorkspaceSandboxEnvVarKind,
} from "@app/types/sandbox/env_var";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { encrypt } from "@app/types/shared/utils/encryption";
import assert from "assert";
import { randomBytes } from "crypto";
import type { Attributes, Transaction } from "sequelize";

// Pod-scoped mirror of WorkspaceSandboxEnvVarResource. Rows are encrypted
// with the pod space sId as scope key (NOT the workspace sId): if a pod is
// ever moved across workspaces its secrets stay decryptable.
//
// No audit events yet: this resource has no HTTP surface in this PR — the
// pod secrets API routes (and their audit instrumentation) ship separately.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PodSandboxEnvVarResource
  extends ReadonlyAttributesType<PodSandboxEnvVarModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PodSandboxEnvVarResource extends BaseResource<PodSandboxEnvVarModel> {
  static model: ModelStaticWorkspaceAware<PodSandboxEnvVarModel> =
    PodSandboxEnvVarModel;

  constructor(
    _model: ModelStaticWorkspaceAware<PodSandboxEnvVarModel>,
    blob: Attributes<PodSandboxEnvVarModel>
  ) {
    super(PodSandboxEnvVarModel, blob);
  }

  get sId(): string {
    return makeSId("pod_sandbox_env_var", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // The wire-format name (composed prefix + suffix), e.g. `DST_FOO` or
  // `DSEC_FOO`. The DB column `name` stores the suffix only.
  get envName(): string {
    return renderWorkspaceSandboxEnvVarName({
      kind: this.kind,
      name: this.name,
    });
  }

  private static assertPod(space: SpaceResource) {
    assert(
      space.isProject(),
      "Only pod spaces can have sandbox environment variables."
    );
  }

  private static fromRow(row: PodSandboxEnvVarModel) {
    return new this(this.model, row.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    pod: SpaceResource,
    where?: Partial<Pick<PodSandboxEnvVarModel, "kind" | "name">>
  ): Promise<PodSandboxEnvVarResource[]> {
    this.assertPod(pod);

    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: pod.id,
      },
      order: [["name", "ASC"]],
    });

    return rows.map((row) => this.fromRow(row));
  }

  static async listForPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<PodSandboxEnvVarResource[]> {
    return this.baseFetch(auth, pod);
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<PodSandboxEnvVarResource | null> {
    if (!isResourceSId("pod_sandbox_env_var", sId)) {
      return null;
    }
    const id = getResourceIdFromSId(sId);
    if (id === null) {
      return null;
    }

    const row = await this.model.findOne({
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return row ? this.fromRow(row) : null;
  }

  // Create-only: pod env vars have no upsert path yet. Relies on the unique
  // (spaceId, name) index to catch concurrent creates.
  static async makeNew(
    auth: Authenticator,
    pod: SpaceResource,
    {
      name,
      value,
      kind = "config",
      allowedDomains,
    }: {
      name: string;
      value: string;
      kind?: WorkspaceSandboxEnvVarKind;
      allowedDomains?: string[] | null;
    }
  ): Promise<Result<PodSandboxEnvVarResource, Error>> {
    this.assertPod(pod);

    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const nameValidation = validateEnvVarName(name);
    if (nameValidation.isErr()) {
      return new Err(new Error(nameValidation.error));
    }

    const valueValidation = validateEnvVarValueForKind({ kind, value });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
      kind,
      allowedDomains,
      requiredForSecret: true,
    });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }

    const count = await this.model.count({
      where: {
        workspaceId: owner.id,
        spaceId: pod.id,
      },
    });
    // Best-effort cap. A concurrent burst of creates for the same pod can
    // land 1-2 rows over MAX_VARS_PER_POD under READ COMMITTED. Acceptable:
    // cap is a UI guard, not a security boundary.
    if (count >= MAX_VARS_PER_POD) {
      return new Err(
        new Error(
          `Pod sandbox environment variable limit reached (${MAX_VARS_PER_POD}).`
        )
      );
    }

    const existing = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        spaceId: pod.id,
        name,
      },
    });
    if (existing) {
      return new Err(
        new Error("Pod sandbox environment variable already exists.")
      );
    }

    const encryptedValue = encrypt({
      text: value,
      key: pod.sId,
      useCase: "developer_secret",
    });

    const row = await this.model.create({
      workspaceId: owner.id,
      spaceId: pod.id,
      name,
      kind,
      // 16 bytes = 32 hex chars in the placeholder; matches the
      // `__DSEC_<32hex>__` format. Stable for the life of the row.
      placeholderNonce: kind === "https_secret" ? randomBytes(16) : null,
      allowedDomains: normalizedAllowedDomains.value ?? null,
      encryptedValue,
      secretSourceKind: "dust-managed",
      secretSourceConfig: null,
      createdByUserId: user.id,
      lastUpdatedByUserId: user.id,
    });

    return new Ok(this.fromRow(row));
  }

  static async listHttpsSecretsForEgress(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<PodSandboxEnvVarResource[]> {
    return this.baseFetch(auth, pod, { kind: "https_secret" });
  }

  // Mirrors WorkspaceSandboxEnvVarResource.loadEnv: resolves config vars to
  // their cleartext values for provider env injection. HTTPS secrets are
  // handled separately by loadHttpsSecretPlaceholderEnv — injecting their
  // real value here would defeat the MITM swap.
  static async loadEnv(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<Record<string, string>, Error>> {
    const resources = await this.baseFetch(auth, pod, { kind: "config" });

    const env: Record<string, string> = {};
    for (const resource of resources) {
      const sourceResult = buildSecretSourceFromRow({
        secretSourceKind: resource.secretSourceKind,
      });
      if (sourceResult.isErr()) {
        return new Err(
          new Error(
            `Failed to resolve pod sandbox environment variable ${resource.envName}: ${sourceResult.error.message}`
          )
        );
      }

      const valueResult = await resolveSecretValue(sourceResult.value, {
        encryptedValue: resource.encryptedValue,
        encryptionKey: pod.sId,
      });
      if (valueResult.isErr()) {
        return new Err(
          new Error(
            `Failed to resolve pod sandbox environment variable ${resource.envName}: ${valueResult.error.message}`
          )
        );
      }

      env[resource.envName] = valueResult.value;
    }

    return new Ok(env);
  }

  static async loadHttpsSecretPlaceholderEnv(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<Record<string, string>, Error>> {
    const resources = await this.listHttpsSecretsForEgress(auth, pod);

    const env: Record<string, string> = {};
    for (const resource of resources) {
      if (!resource.placeholderNonce) {
        return new Err(
          new Error(
            `Pod HTTPS secret sandbox environment variable ${resource.envName} is missing its placeholder nonce.`
          )
        );
      }

      env[resource.envName] = renderEgressSecretPlaceholder(
        resource.placeholderNonce
      );
    }

    return new Ok(env);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON(): PodSandboxEnvVarType {
    return {
      sId: this.sId,
      name: this.envName,
      kind: this.kind,
      placeholderNonce: this.placeholderNonce
        ? this.placeholderNonce.toString("hex")
        : null,
      allowedDomains: this.allowedDomains ? [...this.allowedDomains] : null,
      secretSourceKind: this.secretSourceKind,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
    };
  }

  toLogJSON() {
    return {
      sId: this.sId,
      workspaceId: this.workspaceId,
      spaceId: this.spaceId,
      name: this.envName,
    };
  }
}
