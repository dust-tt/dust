import type { Authenticator } from "@app/lib/auth";
import { InferenceHookModel } from "@app/lib/models/inference_hook";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type {
  InferenceHookCredentials,
  InferenceHookEnforcementMode,
  InferenceHookFailMode,
  InferenceHookPolicy,
  InferenceHookProviderId,
  InferenceHookType,
  UpsertInferenceHookBody,
} from "@app/types/inference_hook";
import {
  InferenceHookCredentialsSchema,
  InferenceHookEnforcementModes,
  InferenceHookFailModes,
  isInferenceHookProviderId,
  parseInferenceHookEndpoint,
  parseInferenceHookTimeoutMs,
  validateInferenceHookCredentials,
} from "@app/types/inference_hook";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface InferenceHookResource
  extends ReadonlyAttributesType<InferenceHookModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InferenceHookResource extends BaseResource<InferenceHookModel> {
  static model: ModelStaticWorkspaceAware<InferenceHookModel> =
    InferenceHookModel;

  constructor(
    model: ModelStatic<InferenceHookModel>,
    blob: Attributes<InferenceHookModel>
  ) {
    super(model, blob);
  }

  get sId(): string {
    return makeSId("inference_hook", {
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  getTypedProviderId(): InferenceHookProviderId {
    if (!isInferenceHookProviderId(this.providerId)) {
      throw new Error(`Unknown inference hook provider: ${this.providerId}`);
    }
    return this.providerId;
  }

  getPolicy(): InferenceHookPolicy {
    const enforcementMode = (
      InferenceHookEnforcementModes as readonly string[]
    ).includes(this.enforcementMode)
      ? (this.enforcementMode as InferenceHookEnforcementMode)
      : "block";
    const failMode = (InferenceHookFailModes as readonly string[]).includes(
      this.failMode
    )
      ? (this.failMode as InferenceHookFailMode)
      : "closed";
    const timeoutParsed = parseInferenceHookTimeoutMs(this.timeoutMs);
    return {
      enforcementMode,
      failMode,
      timeoutMs: timeoutParsed.ok ? timeoutParsed.timeoutMs : 1000,
    };
  }

  static async fetchForWorkspace(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<InferenceHookResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const model = await InferenceHookModel.findOne({
      where: { workspaceId: workspace.id },
      transaction,
    });
    if (!model) {
      return null;
    }
    return new InferenceHookResource(InferenceHookModel, model.get());
  }

  static async upsert(
    auth: Authenticator,
    body: UpsertInferenceHookBody,
    transaction?: Transaction
  ): Promise<Result<InferenceHookResource, Error>> {
    const workspace = auth.getNonNullableWorkspace();

    const endpointParsed = parseInferenceHookEndpoint(
      body.endpoint,
      body.providerId
    );
    if (!endpointParsed.ok) {
      return new Err(new Error(endpointParsed.message));
    }

    const timeoutParsed = parseInferenceHookTimeoutMs(body.timeoutMs);
    if (!timeoutParsed.ok) {
      return new Err(new Error(timeoutParsed.message));
    }

    try {
      const existing = await InferenceHookModel.findOne({
        where: { workspaceId: workspace.id },
        transaction,
      });

      let encryptedCredentials: string;
      if (body.apiKey) {
        const credentialsParsed = validateInferenceHookCredentials({
          providerId: body.providerId,
          apiKey: body.apiKey,
          appKey: body.appKey,
        });
        if (!credentialsParsed.ok) {
          return new Err(new Error(credentialsParsed.message));
        }
        encryptedCredentials = encrypt({
          text: JSON.stringify(credentialsParsed.credentials),
          key: workspace.sId,
          useCase: "developer_secret",
        });
      } else if (existing) {
        encryptedCredentials = existing.encryptedCredentials;
      } else {
        return new Err(new Error("API key is required."));
      }

      const policyFields = {
        enforcementMode: body.enforcementMode,
        failMode: body.failMode,
        timeoutMs: timeoutParsed.timeoutMs,
      };

      if (existing) {
        await existing.update(
          {
            providerId: body.providerId,
            endpoint: endpointParsed.endpoint,
            encryptedCredentials,
            ...policyFields,
          },
          { transaction }
        );
        return new Ok(
          new InferenceHookResource(InferenceHookModel, existing.get())
        );
      }

      const created = await InferenceHookModel.create(
        {
          workspaceId: workspace.id,
          providerId: body.providerId,
          endpoint: endpointParsed.endpoint,
          encryptedCredentials,
          ...policyFields,
        },
        { transaction }
      );
      return new Ok(
        new InferenceHookResource(InferenceHookModel, created.get())
      );
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  getCredentials(auth: Authenticator): InferenceHookCredentials | null {
    const workspace = auth.getNonNullableWorkspace();
    try {
      const decrypted = decrypt({
        encrypted: this.encryptedCredentials,
        key: workspace.sId,
        useCase: "developer_secret",
      });
      const parsed = InferenceHookCredentialsSchema.safeParse(
        JSON.parse(decrypted)
      );
      if (!parsed.success) {
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    if (this.workspaceId !== workspace.id) {
      return new Err(new Error("Inference hook does not belong to workspace."));
    }
    try {
      await this.model.destroy({
        where: { id: this.id, workspaceId: workspace.id },
        transaction,
      });
      return new Ok(this.id);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    await InferenceHookModel.destroy({
      where: { workspaceId: workspace.id },
    });
  }

  toJSON(): InferenceHookType {
    const policy = this.getPolicy();
    return {
      sId: this.sId,
      providerId: this.getTypedProviderId(),
      endpoint: this.endpoint,
      hasCredentials: this.encryptedCredentials.length > 0,
      enforcementMode: policy.enforcementMode,
      failMode: policy.failMode,
      timeoutMs: policy.timeoutMs,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
