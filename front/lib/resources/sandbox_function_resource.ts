import type {
  PokePodFunction,
  PokePodFunctionDetails,
} from "@app/lib/api/poke/projects";
import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import {
  appPrefixFromSlug,
  sandboxFunctionNameFromSlug,
} from "@app/lib/api/sandbox_functions/slug";
import { authorizeSandboxFunctionInvocation } from "@app/lib/api/sandbox_functions/workspace_user";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  SandboxFunctionInvocationModel,
  SandboxFunctionModel,
} from "@app/lib/resources/storage/models/sandbox_function";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { PodAppFunction } from "@app/types/api/pod_apps";
import type {
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionStake,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import {
  DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
  DEFAULT_SANDBOX_FUNCTION_STAKE,
  isValidSandboxFunctionSlug,
} from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { createHash } from "crypto";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { Attributes, Transaction } from "sequelize";
import { col, fn, Op } from "sequelize";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFunctionResource
  extends ReadonlyAttributesType<SandboxFunctionModel> {}

export interface FramePublicationFunctionDefinition {
  name: string;
  description: string;
  userIdentity: SandboxFunctionUserIdentityPolicy;
  executionMode: SandboxFunctionExecutionMode;
  defaultStake: SandboxFunctionStake;
  bundleCode: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}

export const SANDBOX_FUNCTION_PUBLISH_LOCK_TTL_MS = 5 * 60_000;

// A `findAll` carrying an aggregate attribute returns plain rows rather than model instances, so
// the model's declared types do not describe them. Parsed instead of cast so a shape change fails
// loudly. `functionCount` is coerced because aggregates arrive as strings from some drivers.
const FrameFunctionCountRowSchema = z.object({
  fileId: z.number(),
  functionCount: z.coerce.number(),
});

/**
 * Sha256 hex of a published bundle's utf8 bytes — the same bytes uploadContent writes and the
 * in-sandbox warm server hashes off disk, so the two sides can compare (see the runner's serve.ts).
 */
export function computeSandboxFunctionBundleSha256(bundleCode: string): string {
  return createHash("sha256").update(bundleCode, "utf8").digest("hex");
}

/**
 * Short prefix of a bundle sha for tool output: enough to tell two publishes apart at a glance,
 * mirroring short commit hashes. "unknown" covers functions last published before hashes existed.
 */
export function shortSandboxFunctionBundleSha256(sha: string | null): string {
  return sha === null ? "unknown" : sha.slice(0, 12);
}

export function getSandboxFunctionPublishLockName(
  sandboxFunctionSId: string
): string {
  return `sandbox_function:publish:${sandboxFunctionSId}`;
}

function userIdentityPolicyStrength(
  policy: SandboxFunctionUserIdentityPolicy
): number {
  switch (policy) {
    case "optional":
      return 0;
    case "workspace_user_required":
      return 1;
    case "interactive_workspace_user_required":
      return 2;
    case "pod_member_required":
      // The pod-scoped audience ranks above the workspace-wide, session-bound policy: a publish
      // moving to it always commits the policy before exposing the new bundle.
      return 3;
    default:
      // The stored policy can be a value this revision does not know: one from a newer revision
      // in a mixed-version deploy, or a retired policy (e.g. `pod_editor_required`). Rank it
      // strictest so the republish never loosens it early and simply overwrites it with the
      // upload; invoking it is denied regardless (see authorizeSandboxFunctionInvocation).
      // `assertNeverAndIgnore` (not `assertNever`) is deliberate although this is server code:
      // republish is the only path that rewrites a stored policy, so throwing here would make a
      // function carrying a retired policy permanently unrepairable.
      assertNeverAndIgnore(policy);
      return Number.POSITIVE_INFINITY;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFunctionResource extends BaseResource<SandboxFunctionModel> {
  static model: ModelStaticWorkspaceAware<SandboxFunctionModel> =
    SandboxFunctionModel;

  private readonly ownerSpace: SpaceResource | null;
  file: FileResource;

  constructor(
    model: ModelStaticWorkspaceAware<SandboxFunctionModel>,
    blob: Attributes<SandboxFunctionModel>,
    space: SpaceResource | null,
    file: FileResource
  ) {
    super(model, blob);
    this.ownerSpace = space;
    this.file = file;
  }

  get space(): SpaceResource {
    assert(this.ownerSpace, "Frame functions do not belong to a Pod space.");
    return this.ownerSpace;
  }

  get frame(): FileResource | null {
    return this.publicationId !== null && this.file.isFrameV2
      ? this.file
      : null;
  }

  get sId(): string {
    return SandboxFunctionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("sandbox_function", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    {
      space,
      file,
      slug,
      description,
      userIdentity = "optional",
      executionMode = DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
      defaultStake = DEFAULT_SANDBOX_FUNCTION_STAKE,
      bundleSha256 = null,
      inputSchema,
      outputSchema,
    }: {
      space: SpaceResource;
      file: FileResource;
      slug: string;
      description: string;
      userIdentity?: SandboxFunctionUserIdentityPolicy;
      executionMode?: SandboxFunctionExecutionMode;
      defaultStake?: SandboxFunctionStake;
      bundleSha256?: string | null;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    },
    transaction?: Transaction
  ): Promise<SandboxFunctionResource> {
    assert(space.isProject(), "Sandbox functions can only belong to pods.");
    assert(
      isValidSandboxFunctionSlug(slug),
      "The slug must be lowercase alphanumeric with single hyphen separators."
    );
    assert(
      space.workspaceId === auth.getNonNullableWorkspace().id,
      "The space must belong to the authenticated workspace."
    );
    assert(
      file.workspaceId === auth.getNonNullableWorkspace().id,
      "The file must belong to the authenticated workspace."
    );
    assert(
      file.contentType === sandboxFunctionContentType,
      `The file must use the ${sandboxFunctionContentType} content type.`
    );
    assert(
      file.useCase === "project_context",
      "The file must use the project_context use case."
    );
    assert(
      file.useCaseMetadata?.spaceId === space.sId,
      "The file must belong to the same pod as the sandbox function."
    );

    const sandboxFunction = await this.model.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
        fileId: file.id,
        slug,
        description,
        userIdentity,
        executionMode,
        defaultStake,
        bundleSha256,
        inputSchema,
        outputSchema,
      },
      { transaction }
    );

    return new this(this.model, sandboxFunction.get(), space, file);
  }

  static async createForFramePublication(
    auth: Authenticator,
    {
      frame,
      functions,
      publicationId,
    }: {
      frame: FileResource;
      functions: FramePublicationFunctionDefinition[];
      publicationId: string;
    },
    transaction: Transaction
  ): Promise<void> {
    const owner = auth.getNonNullableWorkspace();
    assert(frame.isFrameV2, "Frame functions require a Frames v2 file.");
    assert(
      frame.workspaceId === owner.id,
      "The Frame must belong to the authenticated workspace."
    );

    await this.model.bulkCreate(
      functions.map((fn) => ({
        workspaceId: owner.id,
        spaceId: null,
        fileId: frame.id,
        publicationId,
        slug: fn.name,
        description: fn.description,
        userIdentity: fn.userIdentity,
        executionMode: fn.executionMode,
        defaultStake: fn.defaultStake,
        bundleSha256: computeSandboxFunctionBundleSha256(fn.bundleCode),
        inputSchema: fn.inputSchema,
        outputSchema: fn.outputSchema,
      })),
      { transaction, validate: true }
    );
  }

  /**
   * Re-publish: overwrite this function's bundle in place and refresh its contract. uploadContent
   * rewrites the same file (canonical original plus its mount path <prefix>/<slug>.ts) and bumps the
   * version, so the function's storage path stays stable across re-publishes rather than drifting to
   * a disambiguated name. The caller checks write permission.
   *
   * Reports whether the new bundle is byte-identical to the one it replaces: a publisher who
   * edited the source expects the built output to change, and echoing that it did not lets the
   * caller surface "your edit didn't land" instead of leaving a stale-publish hunt.
   */
  async updateContent(
    auth: Authenticator,
    {
      bundleCode,
      description,
      userIdentity = this.userIdentity ?? "optional",
      executionMode = DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
      defaultStake = DEFAULT_SANDBOX_FUNCTION_STAKE,
      inputSchema,
      outputSchema,
    }: {
      bundleCode: string;
      description: string;
      userIdentity?: SandboxFunctionUserIdentityPolicy;
      executionMode?: SandboxFunctionExecutionMode;
      defaultStake?: SandboxFunctionStake;
      inputSchema: JSONSchema;
      outputSchema: JSONSchema;
    }
  ): Promise<Result<{ byteIdentical: boolean }, Error>> {
    try {
      return await executeWithLock(
        getSandboxFunctionPublishLockName(this.sId),
        async () => {
          const currentFunction = await this.model.findOne({
            where: {
              id: this.id,
              workspaceId: auth.getNonNullableWorkspace().id,
            },
          });
          if (!currentFunction) {
            return new Err(new Error("The Pod Function no longer exists."));
          }

          // Hash of the exact code the upload below writes. Compared against the row re-read
          // under the lock, not the in-memory copy, so a concurrent publish cannot skew the
          // byte-identical report. Null on the row (pre-hash publishes) never matches.
          const bundleSha256 = computeSandboxFunctionBundleSha256(bundleCode);
          const byteIdentical = currentFunction.bundleSha256 === bundleSha256;

          const currentUserIdentity =
            currentFunction.userIdentity ?? "optional";
          if (
            userIdentityPolicyStrength(userIdentity) >
            userIdentityPolicyStrength(currentUserIdentity)
          ) {
            // Commit a stricter policy before exposing its bundle. If the
            // upload fails, the old bundle remains callable only under the
            // stricter policy.
            await this.update({ userIdentity });
          }

          await this.file.uploadContent(auth, bundleCode);
          // The execution mode is restated by every publish, like the description and the schemas:
          // a re-publish that does not name it gets the default. Carrying the old mode forward
          // would keep a function fast after the publish that added a tool call to it, which only
          // shows up as a refused tool call at run time.
          //
          // It moves after the upload, and unlike the user identity policy there is no window to
          // guard: whichever mode is in effect while the upload lands, a fast bundle running as
          // durable is harmless and a durable bundle running as fast just fails its tool calls.
          //
          // The default stake is restated on the same terms, and for the same reason: a function
          // that grew a destructive path must not keep the `never_ask` it earned while it was a
          // read. Nothing gates on the stake until a function is shared as an MCP tool, so it needs
          // no ordering guard against the upload yet — sharing it will need one, so that a stricter
          // stake lands before the bundle it applies to, the way the user identity policy does.
          await this.update({
            description,
            userIdentity,
            executionMode,
            defaultStake,
            // The hash lands with the row update (not before the upload), so a warm server can
            // never be told to expect a bundle that is not on disk yet; invocations racing this
            // publish carry the old hash and settle against whichever bundle they were issued
            // for.
            bundleSha256,
            inputSchema,
            outputSchema,
          });

          return new Ok({ byteIdentical });
        },
        30_000,
        { lockTtlMs: SANDBOX_FUNCTION_PUBLISH_LOCK_TTL_MS }
      );
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  // `includeDeletedSpace` refers to the pod, not to the functions themselves: pods are
  // soft-deleted before being scrubbed, and without it every function of a pod being deleted
  // resolves to no space and is silently dropped here.
  private static async baseFetch(
    auth: Authenticator,
    {
      includeDeletedSpace,
      includeFrameFunctions = false,
      dangerouslyBypassSpacePermissionFilter = false,
      ...options
    }: ResourceFindOptions<SandboxFunctionModel> & {
      includeDeletedSpace?: boolean;
      includeFrameFunctions?: boolean;
      // Reserved for resolution paths whose authorization is established before the fetch:
      // fetchByIdForExecution and the tool workflow (an invocation row), and fetchInAppFolder
      // (a validated frame share capability, enforced by its own query constraints).
      dangerouslyBypassSpacePermissionFilter?: boolean;
    } = {}
  ): Promise<SandboxFunctionResource[]> {
    const { where, ...rest } = options;
    const sandboxFunctions = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      Array.from(
        new Set(
          sandboxFunctions.flatMap((sandboxFunction) => {
            const { spaceId } = sandboxFunction.get();
            return spaceId === null ? [] : [spaceId];
          })
        )
      ),
      { includeDeleted: includeDeletedSpace }
    );
    const accessibleSpacesById = new Map(
      spaces
        .filter(
          (space) =>
            space.isProject() &&
            (auth.can("read", space) || auth.can("admin", space))
        )
        .map((space) => [space.id, space])
    );

    const files = await FileResource.fetchByModelIdsWithAuth(
      auth,
      Array.from(
        new Set(
          sandboxFunctions.map(
            (sandboxFunction) => sandboxFunction.get().fileId
          )
        )
      )
    );
    const filesById = new Map(files.map((file) => [file.id, file]));

    const spacesById = dangerouslyBypassSpacePermissionFilter
      ? new Map(spaces.map((space) => [space.id, space]))
      : null;

    return sandboxFunctions.flatMap((sandboxFunction) => {
      const blob = sandboxFunction.get();
      if (blob.spaceId === null) {
        const file = filesById.get(blob.fileId);
        if (
          !includeFrameFunctions ||
          blob.publicationId === null ||
          !file?.isFrameV2
        ) {
          return [];
        }

        return [new this(this.model, blob, null, file)];
      }

      const space =
        accessibleSpacesById.get(blob.spaceId) ?? spacesById?.get(blob.spaceId);
      const file = filesById.get(blob.fileId);
      if (!space || !file) {
        return [];
      }

      return [new this(this.model, blob, space, file)];
    });
  }

  static async fetchById(
    auth: Authenticator,
    sandboxFunctionId: string
  ): Promise<SandboxFunctionResource | null> {
    if (!isResourceSId("sandbox_function", sandboxFunctionId)) {
      return null;
    }

    const sandboxFunctionModelId = getResourceIdFromSId(sandboxFunctionId);
    if (sandboxFunctionModelId === null) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { id: sandboxFunctionModelId },
    });

    return sandboxFunction ?? null;
  }

  /**
   * Resolve either owner kind for caller-facing invocation routes. Pod space access is still
   * filtered here; Frame use rights and active-publication checks are applied by the route
   * resolver once the owning Frame is known.
   */
  static async fetchByIdForInvocationResolution(
    auth: Authenticator,
    sandboxFunctionId: string
  ): Promise<SandboxFunctionResource | null> {
    if (!isResourceSId("sandbox_function", sandboxFunctionId)) {
      return null;
    }
    const sandboxFunctionModelId = getResourceIdFromSId(sandboxFunctionId);
    if (sandboxFunctionModelId === null) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { id: sandboxFunctionModelId },
      includeFrameFunctions: true,
    });
    return sandboxFunction ?? null;
  }

  /**
   * Gets the function if a matching invocation exists.
   * In the context of a temporal activity or a sandbox callback, we don't have the original
   * caller's grant (e.g. a frame share token) in the auth, so the space permission filter is
   * deliberately skipped. The invocation ties the pair together; callers are trusted because
   * their (function, invocation) ids come from server-minted inputs — workflow args or verified
   * sandbox JWT claims — never from user input.
   */
  static async fetchByIdForExecution(
    auth: Authenticator,
    {
      sandboxFunctionId,
      invocationId,
    }: { sandboxFunctionId: string; invocationId: string }
  ): Promise<SandboxFunctionResource | null> {
    const sandboxFunctionModelId = getResourceIdFromSId(sandboxFunctionId);
    if (sandboxFunctionModelId === null) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { id: sandboxFunctionModelId },
      includeFrameFunctions: true,
      dangerouslyBypassSpacePermissionFilter: true,
    });
    if (!sandboxFunction) {
      return null;
    }

    // We don't need the invocation itself, just its existence.
    const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId,
      access: "system",
    });
    return invocation ? sandboxFunction : null;
  }

  // Lives here rather than on SandboxFunctionMCPActionResource: that resource can only type-import
  // the invocation resource (the invocation resource value-imports it for cascade deletion), so it
  // cannot construct an invocation. Takes the action rather than its FK id so callers don't thread
  // a ModelId around.
  static async fetchInvocationForAction(
    auth: Authenticator,
    action: SandboxFunctionMCPActionResource
  ): Promise<SandboxFunctionInvocationResource | null> {
    const invocation = await SandboxFunctionInvocationModel.findOne({
      where: {
        id: action.sandboxFunctionInvocationId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    if (!invocation) {
      return null;
    }

    // The invocation row above is the execution side's proof of authorization: the tool workflow must
    // resolve the function even when the invoker's original grant (e.g. a frame share token)
    // cannot be reconstructed from the serialized auth.
    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { id: invocation.sandboxFunctionId },
      includeFrameFunctions: true,
      dangerouslyBypassSpacePermissionFilter: true,
    });
    if (!sandboxFunction) {
      return null;
    }

    return SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId: SandboxFunctionInvocationResource.modelIdToSId({
        id: invocation.id,
        workspaceId: invocation.workspaceId,
      }),
      access: "system",
    });
  }

  /**
   * Fetch an invocation through its stable Frame identity. The function row is resolved from the
   * invocation itself rather than from the active publication, so an in-flight stream survives a
   * republish or removal of the function from a later publication.
   */
  static async fetchInvocationByFrameAndId(
    auth: Authenticator,
    {
      frame,
      invocationId,
    }: {
      frame: FileResource;
      invocationId: string;
    }
  ): Promise<SandboxFunctionInvocationResource | null> {
    if (
      !frame.isFrameV2 ||
      !isResourceSId("sandbox_function_invocation", invocationId)
    ) {
      return null;
    }
    const invocationModelId = getResourceIdFromSId(invocationId);
    if (invocationModelId === null) {
      return null;
    }

    const invocation = await SandboxFunctionInvocationModel.findOne({
      attributes: ["sandboxFunctionId"],
      where: {
        id: invocationModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    if (!invocation) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: {
        id: invocation.sandboxFunctionId,
        fileId: frame.id,
      },
      includeFrameFunctions: true,
    });
    if (!sandboxFunction) {
      return null;
    }

    return SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId,
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<SandboxFunctionResource[]> {
    if (!space.isProject()) {
      return [];
    }

    return this.baseFetch(auth, { where: { spaceId: space.id } });
  }

  static async listByFramePublication(
    auth: Authenticator,
    { frame, publicationId }: { frame: FileResource; publicationId: string }
  ): Promise<SandboxFunctionResource[]> {
    if (!frame.isFrameV2) {
      return [];
    }

    return this.baseFetch(auth, {
      where: { fileId: frame.id, publicationId },
      includeFrameFunctions: true,
    });
  }

  /**
   * One grouped count per Frame's *active* publication — the Poke Frames list must not query per
   * row, and must not count functions from publications that are no longer served (a frame keeps
   * every past publication's function rows around, so a plain per-file count would grow with
   * every publish instead of matching what `listByFramePublication` actually serves).
   */
  static async countByFrameModelIds(
    auth: Authenticator,
    framePublications: {
      frameModelId: ModelId;
      activePublicationId: string | null;
    }[]
  ): Promise<Map<ModelId, number>> {
    const activePairs = framePublications.filter(
      (
        framePublication
      ): framePublication is {
        frameModelId: ModelId;
        activePublicationId: string;
      } => framePublication.activePublicationId !== null
    );

    if (activePairs.length === 0) {
      return new Map();
    }

    const rows = await SandboxFunctionModel.findAll({
      attributes: ["fileId", [fn("COUNT", col("id")), "functionCount"]],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        // Exact (fileId, publicationId) pairs rather than independent `IN` lists: publication ids
        // are not guaranteed distinct across frames (test fixtures reuse the same literal id), so
        // crossing the two lists could attribute one frame's functions to another.
        [Op.or]: activePairs.map(({ frameModelId, activePublicationId }) => ({
          fileId: frameModelId,
          publicationId: activePublicationId,
        })),
      },
      group: ["fileId", "publicationId"],
      raw: true,
    });

    return new Map(
      rows.map((row) => {
        const { fileId, functionCount } =
          FrameFunctionCountRowSchema.parse(row);
        return [fileId, functionCount];
      })
    );
  }

  static async fetchByFramePublicationAndSlug(
    auth: Authenticator,
    {
      frame,
      publicationId,
      slug,
    }: { frame: FileResource; publicationId: string; slug: string }
  ): Promise<SandboxFunctionResource | null> {
    if (!frame.isFrameV2 || !isValidSandboxFunctionSlug(slug)) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { fileId: frame.id, publicationId, slug },
      includeFrameFunctions: true,
    });

    return sandboxFunction ?? null;
  }

  static async fetchBySpaceAndSlug(
    auth: Authenticator,
    space: SpaceResource,
    slug: string
  ): Promise<SandboxFunctionResource | null> {
    if (!space.isProject()) {
      return null;
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where: { spaceId: space.id, slug },
    });

    return sandboxFunction ?? null;
  }

  static async fetchByIdOrSlug(
    auth: Authenticator,
    functionIdOrSlug: string
  ): Promise<SandboxFunctionResource | null> {
    const sandboxFunction = await this.fetchById(auth, functionIdOrSlug);
    if (sandboxFunction) {
      return sandboxFunction;
    }

    const [podId, slug, ...rest] = functionIdOrSlug.split("/");
    if (!podId || !slug || rest.length > 0) {
      return null;
    }
    if (!isResourceSId("space", podId) || !isValidSandboxFunctionSlug(slug)) {
      return null;
    }

    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return null;
    }

    return this.fetchBySpaceAndSlug(auth, space, slug);
  }

  /**
   * Resolve a function through a frame share capability: returned iff it lives in the given
   * pod's app folder, regardless of the caller's standing in the pod — the (podId, appPrefix)
   * pair comes from a validated share token, and constraining the lookup to it IS the
   * authorization. Accepts the same identifier forms as fetchByIdOrSlug; a slug form naming
   * another pod misses, since the lookup only ever queries `podId`.
   */
  static async fetchInAppFolder(
    auth: Authenticator,
    {
      podId,
      appPrefix,
      idOrSlug,
    }: { podId: string; appPrefix: string; idOrSlug: string }
  ): Promise<SandboxFunctionResource | null> {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space || !space.isProject()) {
      return null;
    }

    let where:
      | { id: ModelId; spaceId: ModelId }
      | { spaceId: ModelId; slug: string };
    if (isResourceSId("sandbox_function", idOrSlug)) {
      // sId form, e.g. `sfn_x7GhK2p`.
      const sandboxFunctionModelId = getResourceIdFromSId(idOrSlug);
      if (sandboxFunctionModelId === null) {
        return null;
      }
      where = { id: sandboxFunctionModelId, spaceId: space.id };
    } else {
      // Pod-qualified slug form, e.g. `spc_9fJq3Lm/tasklist__add-task`.
      const [slugPodId, slug, ...rest] = idOrSlug.split("/");
      if (
        !slugPodId ||
        !slug ||
        rest.length > 0 ||
        slugPodId !== podId ||
        !isValidSandboxFunctionSlug(slug)
      ) {
        return null;
      }
      where = { spaceId: space.id, slug };
    }

    const [sandboxFunction] = await this.baseFetch(auth, {
      where,
      dangerouslyBypassSpacePermissionFilter: true,
    });
    if (!sandboxFunction) {
      return null;
    }

    return appPrefixFromSlug(sandboxFunction.slug) === appPrefix
      ? sandboxFunction
      : null;
  }

  static async deleteAllForSpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<Result<number, Error>> {
    assert(space.isProject(), "Sandbox functions can only belong to pods.");

    // The pod is already soft-deleted when the scrub runs, hence `includeDeletedSpace`.
    const sandboxFunctions = await this.baseFetch(auth, {
      where: { spaceId: space.id },
      includeDeletedSpace: true,
    });
    for (const sandboxFunction of sandboxFunctions) {
      // TODO(spolu): potentially optimize as this may be quite slow (each delete calls file delete
      // which deletes a whole bunch of records).
      const result = await sandboxFunction.delete(auth);
      if (result.isErr()) {
        return new Err(result.error);
      }
    }

    // `baseFetch` drops rows it cannot fully hydrate, so a partial list would leave rows behind and
    // surface much later as a foreign key violation on the pod hard delete. Fail here instead, with
    // the ids an operator needs to unblock the scrub.
    const remaining = await this.model.findAll({
      attributes: ["id"],
      where: {
        spaceId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    if (remaining.length > 0) {
      return new Err(
        new Error(
          `Sandbox function(s) of pod ${space.sId} could not be deleted: ` +
            `${remaining.map(({ id }) => id).join(", ")}.`
        )
      );
    }

    return new Ok(sandboxFunctions.length);
  }

  /**
   * Make a fast function durable, after it did something only a durable function can do.
   *
   * A fast function is published on the promise that it does not call Dust tools. When it breaks
   * that promise the invocation fails, and without this the next one fails the same way: the
   * publisher's declaration is wrong and nothing on the platform knows it. Recording durable here
   * costs that function its fast path and makes every later invocation work.
   *
   * The update is guarded on the mode still being fast, so concurrent invocations that each break
   * the promise converge on one write, and a function whose publisher has already moved it is left
   * alone. Returns whether this call is the one that moved it.
   *
   * A re-publish restates the mode, so this is an override the publisher can clear rather than a
   * permanent verdict. If the republished bundle still calls tools, it is simply made durable
   * again.
   */
  async makeDurable(auth: Authenticator): Promise<boolean> {
    const [affectedCount, rows] = await this.model.update(
      { executionMode: "durable" },
      {
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          executionMode: "fast",
        },
        returning: true,
      }
    );
    if (affectedCount === 0) {
      return false;
    }

    const row = rows[0];
    if (row) {
      Object.assign(this, row.get());
    }

    return true;
  }

  async invoke(
    auth: Authenticator,
    body: PostSandboxFunctionInvocationRequestBody,
    { origin = "delegated" }: { origin?: SandboxFunctionInvocationOrigin } = {}
  ): Promise<Result<SandboxFunctionInvocationResource, Error>> {
    if (auth.getNonNullableWorkspace().id !== this.workspaceId) {
      return new Err(
        new SandboxFunctionInvocationError(
          `This ${this.frame ? "Frame function" : "Pod Function"} belongs to another workspace.`
        )
      );
    }
    const frame = this.frame;
    const authorization = await authorizeSandboxFunctionInvocation(auth, {
      userIdentity: this.userIdentity,
      origin,
      owner: frame
        ? { kind: "frame", frame }
        : { kind: "pod", space: this.space },
    });
    if (!authorization.authorized) {
      return new Err(
        new SandboxFunctionInvocationError(
          authorization.errorMessage,
          authorization.errorCode
        )
      );
    }

    return SandboxFunctionInvocationResource.createAndStartExecution(auth, {
      sandboxFunction: this,
      body,
      origin,
    });
  }

  toPokeJSON(author: UserResource | null): PokePodFunction {
    return {
      sId: this.sId,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      author: author ? author.fullName() : null,
    };
  }

  // What the Pod's Apps tab shows for a function it lists under its app. Carries both the full slug
  // (which addresses the function) and the bare name (which is all the app's own view needs to show).
  toPodAppJSON(): PodAppFunction {
    return {
      slug: this.slug,
      name: sandboxFunctionNameFromSlug(this.slug),
      description: this.description,
      executionMode: this.executionMode,
      defaultStake: this.defaultStake,
    };
  }

  // The listing shape plus what only a single-function view needs: its contract and the bundle
  // file it was published from.
  toPokeDetailsJSON(author: UserResource | null): PokePodFunctionDetails {
    return {
      ...this.toPokeJSON(author),
      fileId: this.file.sId,
      userIdentity: this.userIdentity,
      executionMode: this.executionMode,
      defaultStake: this.defaultStake,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
    };
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      if (!auth.can("read", this.space) && !auth.can("admin", this.space)) {
        return new Err(new Error("Sandbox function space is not accessible."));
      }

      await SandboxFunctionInvocationResource.deleteAllForSandboxFunction(this);

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

      return this.file.delete(auth);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
