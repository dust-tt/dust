import {
  areAllowedDomainsEqual,
  MAX_VARS_PER_POD,
  normalizeAllowedDomainsForKind,
  renderEgressSecretPlaceholder,
  renderWorkspaceSandboxEnvVarName,
  validateEnvVarName,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
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
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { randomBytes } from "crypto";
import type { Attributes, Includeable, Transaction } from "sequelize";

// Pod-scoped mirror of WorkspaceSandboxEnvVarResource. Rows are encrypted
// with the pod space sId as scope key (NOT the workspace sId): if a pod is
// ever moved across workspaces its secrets stay decryptable.
//
// No audit events yet: this resource has no HTTP surface in this PR — the
// pod secrets API routes (and their audit instrumentation) ship separately.

const USER_JOIN_INCLUDES: Includeable[] = [
  {
    association: "createdByUser",
    attributes: ["name"],
    required: false,
  },
  {
    association: "lastUpdatedByUser",
    attributes: ["name"],
    required: false,
  },
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PodSandboxEnvVarResource
  extends ReadonlyAttributesType<PodSandboxEnvVarModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PodSandboxEnvVarResource extends BaseResource<PodSandboxEnvVarModel> {
  static model: ModelStaticWorkspaceAware<PodSandboxEnvVarModel> =
    PodSandboxEnvVarModel;

  private readonly createdByName: string | null;
  private readonly lastUpdatedByName: string | null;

  constructor(
    _model: ModelStaticWorkspaceAware<PodSandboxEnvVarModel>,
    blob: Attributes<PodSandboxEnvVarModel>,
    metadata?: {
      createdByName: string | null;
      lastUpdatedByName: string | null;
    }
  ) {
    super(PodSandboxEnvVarModel, blob);
    this.createdByName = metadata?.createdByName ?? null;
    this.lastUpdatedByName = metadata?.lastUpdatedByName ?? null;
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

  // Instance-level ownership guard for mutations: the pod passed by the
  // caller supplies the encryption scope key (pod.sId), so a mismatched pod
  // would re-encrypt the row under the wrong key and silently corrupt it.
  private assertRowBelongsToPod(pod: SpaceResource) {
    PodSandboxEnvVarResource.assertPod(pod);
    assert(
      this.spaceId === pod.id,
      "Pod sandbox environment variable does not belong to this pod."
    );
  }

  private static fromRow(row: PodSandboxEnvVarModel) {
    return new this(this.model, row.get(), {
      createdByName: row.createdByUser?.name ?? null,
      lastUpdatedByName: row.lastUpdatedByUser?.name ?? null,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    pod: SpaceResource,
    where?: Partial<Pick<PodSandboxEnvVarModel, "kind" | "name">>,
    { withUserJoins = true }: { withUserJoins?: boolean } = {}
  ): Promise<PodSandboxEnvVarResource[]> {
    this.assertPod(pod);

    const isPointLookup = Boolean(where?.name);
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: pod.id,
      },
      include: withUserJoins ? USER_JOIN_INCLUDES : [],
      // Skip ordering on point lookups — (spaceId, name) is unique.
      order: isPointLookup ? undefined : [["name", "ASC"]],
    });

    return rows.map((row) => this.fromRow(row));
  }

  static async listForPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<PodSandboxEnvVarResource[]> {
    return this.baseFetch(auth, pod);
  }

  static async fetchByName(
    auth: Authenticator,
    pod: SpaceResource,
    name: string
  ): Promise<PodSandboxEnvVarResource | null> {
    const rows = await this.baseFetch(auth, pod, { name });
    return rows[0] ?? null;
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
      include: USER_JOIN_INCLUDES,
    });

    return row ? this.fromRow(row) : null;
  }

  // Rejects kind transitions: the one-way config -> https_secret promotion
  // goes through `promoteToHttpsSecret`. For an existing https_secret row,
  // callers may pass `allowedDomains` alongside the new value to rotate both
  // in one call.
  static async upsert(
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
  ): Promise<
    Result<{ resource: PodSandboxEnvVarResource; created: boolean }, Error>
  > {
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

    const encryptedValue = encrypt({
      text: value,
      key: pod.sId,
      useCase: "developer_secret",
    });

    const existing = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        spaceId: pod.id,
        name,
      },
    });

    let row: PodSandboxEnvVarModel;
    let created: boolean;
    if (existing) {
      if (existing.kind !== kind) {
        return new Err(
          new Error(
            `Cannot change pod sandbox environment variable kind from ${existing.kind} to ${kind} through upsert.`
          )
        );
      }

      const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
        kind,
        allowedDomains,
        requiredForSecret: false,
      });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }

      // `existing` is a Sequelize model instance (we found it via `findOne`
      // above), not a Resource — that's why we call its `update()` directly
      // instead of `this.update()`. The Resource's `this.update()` is used
      // in `updateValue` / `updateAllowedDomains` where we already hold a
      // resource handle.
      row = await existing.update({
        encryptedValue,
        ...(allowedDomains === undefined || allowedDomains === null
          ? {}
          : { allowedDomains: normalizedAllowedDomains.value }),
        lastUpdatedByUserId: user.id,
      });
      created = false;
    } else {
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

      const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
        kind,
        allowedDomains,
        requiredForSecret: true,
      });
      if (normalizedAllowedDomains.isErr()) {
        return normalizedAllowedDomains;
      }

      row = await this.model.create({
        workspaceId: owner.id,
        spaceId: pod.id,
        name,
        kind,
        // 16 bytes = 32 hex chars in the placeholder; matches the
        // `__DSEC_<32hex>__` format. Stable for the life of the row
        // (rotations and allowedDomains edits don't touch it).
        placeholderNonce: kind === "https_secret" ? randomBytes(16) : null,
        allowedDomains: normalizedAllowedDomains.value ?? null,
        encryptedValue,
        secretSourceKind: "dust-managed",
        secretSourceConfig: null,
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      });
      created = true;
    }

    // Reload by primary key to populate createdByUser / lastUpdatedByUser
    // associations — the row returned by update() / create() has no joins
    // loaded, which would surface as "Unknown" in the UI until SWR re-lists.
    await row.reload({ include: USER_JOIN_INCLUDES });
    return new Ok({ resource: this.fromRow(row), created });
  }

  // Create-only entry point for callers that must not replace an existing
  // value. Implementation defers to upsert() and rejects when the row already
  // existed — relies on the unique (spaceId, name) index to catch concurrent
  // creates.
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
    const result = await this.upsert(auth, pod, {
      name,
      value,
      kind,
      allowedDomains,
    });
    if (result.isErr()) {
      return result;
    }

    if (!result.value.created) {
      return new Err(
        new Error("Pod sandbox environment variable already exists.")
      );
    }

    return new Ok(result.value.resource);
  }

  async updateValue(
    auth: Authenticator,
    pod: SpaceResource,
    { value }: { value: string }
  ): Promise<Result<PodSandboxEnvVarResource, Error>> {
    this.assertRowBelongsToPod(pod);

    const user = auth.getNonNullableUser();

    const valueValidation = validateEnvVarValueForKind({
      kind: this.kind,
      value,
    });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    const encryptedValue = encrypt({
      text: value,
      key: pod.sId,
      useCase: "developer_secret",
    });

    await this.update({
      encryptedValue,
      lastUpdatedByUserId: user.id,
    });

    return new Ok(this);
  }

  async updateAllowedDomains(
    auth: Authenticator,
    pod: SpaceResource,
    { allowedDomains }: { allowedDomains: string[] }
  ): Promise<Result<PodSandboxEnvVarResource, Error>> {
    this.assertRowBelongsToPod(pod);

    if (this.kind !== "https_secret") {
      return new Err(
        new Error("Allowed domains can only be updated for HTTPS secrets.")
      );
    }

    const user = auth.getNonNullableUser();
    const previousAllowedDomains = this.allowedDomains;

    const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
      kind: this.kind,
      allowedDomains,
      requiredForSecret: true,
    });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }
    const normalizedAllowedDomainsValue = normalizedAllowedDomains.value;
    if (!normalizedAllowedDomainsValue) {
      return new Err(
        new Error("HTTPS secrets require at least one allowed domain.")
      );
    }

    if (
      areAllowedDomainsEqual(
        previousAllowedDomains,
        normalizedAllowedDomainsValue
      )
    ) {
      return new Ok(this);
    }

    await this.update({
      allowedDomains: normalizedAllowedDomainsValue,
      lastUpdatedByUserId: user.id,
    });

    return new Ok(this);
  }

  async promoteToHttpsSecret(
    auth: Authenticator,
    pod: SpaceResource,
    { allowedDomains }: { allowedDomains: string[] }
  ): Promise<Result<PodSandboxEnvVarResource, Error>> {
    this.assertRowBelongsToPod(pod);

    if (this.kind !== "config") {
      return new Err(
        new Error(
          "Only config sandbox environment variables can be promoted to HTTPS secrets."
        )
      );
    }

    const user = auth.getNonNullableUser();
    const previousEnvName = this.envName;

    const normalizedAllowedDomains = normalizeAllowedDomainsForKind({
      kind: "https_secret",
      allowedDomains,
      requiredForSecret: true,
    });
    if (normalizedAllowedDomains.isErr()) {
      return normalizedAllowedDomains;
    }
    const normalizedAllowedDomainsValue = normalizedAllowedDomains.value;
    if (!normalizedAllowedDomainsValue) {
      return new Err(
        new Error("HTTPS secrets require at least one allowed domain.")
      );
    }

    if (this.encryptedValue === null) {
      return new Err(
        new Error(
          `Pod sandbox environment variable ${previousEnvName} has no encrypted value.`
        )
      );
    }

    let currentValue: string;
    try {
      currentValue = decrypt({
        encrypted: this.encryptedValue,
        key: pod.sId,
        useCase: "developer_secret",
      });
    } catch (error) {
      return new Err(
        new Error(
          `Failed to decrypt pod sandbox environment variable ${previousEnvName}: ${
            normalizeError(error).message
          }`
        )
      );
    }

    const valueValidation = validateEnvVarValueForKind({
      kind: "https_secret",
      value: currentValue,
    });
    if (valueValidation.isErr()) {
      return new Err(new Error(valueValidation.error));
    }

    await this.update({
      kind: "https_secret",
      placeholderNonce: randomBytes(16),
      allowedDomains: normalizedAllowedDomainsValue,
      lastUpdatedByUserId: user.id,
    });

    return new Ok(this);
  }

  static async listHttpsSecretsForEgress(
    auth: Authenticator,
    pod: SpaceResource,
    owner: SandboxRuntimeOwner
  ): Promise<PodSandboxEnvVarResource[]> {
    assert(
      owner.kind === "pod" && owner.spaceId === pod.sId,
      "Pod env vars can only be loaded for pod-owned sandboxes."
    );

    return this.baseFetch(
      auth,
      pod,
      { kind: "https_secret" },
      { withUserJoins: false }
    );
  }

  // Mirrors WorkspaceSandboxEnvVarResource.loadEnv: decrypts config vars for
  // provider env injection. HTTPS secrets are handled separately by
  // loadHttpsSecretPlaceholderEnv — injecting their real value here would
  // defeat the MITM swap.
  static async loadEnv(
    auth: Authenticator,
    pod: SpaceResource,
    owner: SandboxRuntimeOwner
  ): Promise<Result<Record<string, string>, Error>> {
    assert(
      owner.kind === "pod" && owner.spaceId === pod.sId,
      "Pod env vars can only be loaded for pod-owned sandboxes."
    );

    const resources = await this.baseFetch(
      auth,
      pod,
      { kind: "config" },
      { withUserJoins: false }
    );

    const env: Record<string, string> = {};
    for (const resource of resources) {
      if (resource.secretSourceKind !== "dust-managed") {
        return new Err(
          new Error(
            `Secret source '${resource.secretSourceKind}' is not yet implemented for pod env var ${resource.envName}.`
          )
        );
      }

      if (resource.encryptedValue === null) {
        return new Err(
          new Error(
            `Pod sandbox environment variable ${resource.envName} has no encrypted value.`
          )
        );
      }

      try {
        // pod.sId = ownerId, same role as workspace.sId in
        // WorkspaceSandboxEnvVarResource.
        env[resource.envName] = decrypt({
          encrypted: resource.encryptedValue,
          key: pod.sId,
          useCase: "developer_secret",
        });
      } catch (error) {
        return new Err(
          new Error(
            `Failed to decrypt pod sandbox environment variable ${resource.envName}: ${
              normalizeError(error).message
            }`
          )
        );
      }
    }

    return new Ok(env);
  }

  static async loadHttpsSecretPlaceholderEnv(
    auth: Authenticator,
    pod: SpaceResource,
    owner: SandboxRuntimeOwner
  ): Promise<Result<Record<string, string>, Error>> {
    const resources = await this.listHttpsSecretsForEgress(auth, pod, owner);

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
      createdByName: this.createdByName,
      lastUpdatedByName: this.lastUpdatedByName,
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
