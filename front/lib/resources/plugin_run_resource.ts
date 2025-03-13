// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  LightWorkspaceType,
  PluginArgs,
  PluginResourceTarget,
} from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type {
  InferPluginArgs,
  Plugin,
  PluginResponse,
} from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  PluginRunModel,
  POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH,
} from "@app/lib/resources/storage/models/plugin_runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

import type { UserResource } from "./user_resource";

function redactPluginArgs(
  plugin: Plugin<PluginArgs>,
  args: InferPluginArgs<PluginArgs>
) {
  const sanitizedArgs: Record<string, unknown> = {};

  for (const [key, arg] of Object.entries(plugin.manifest.args)) {
    if (arg.redact) {
      sanitizedArgs[key] = "REDACTED";
    } else {
      sanitizedArgs[key] = args[key];
    }
  }

  return sanitizedArgs;
}

// This might save a non-valid JSON object in the DB. It needs to be safely parsed.
function trimPluginRunResultOrError(result: PluginResponse | string) {
  let stringResult: string;
  if (typeof result === "string") {
    stringResult = JSON.stringify(result);
  } else {
    stringResult = JSON.stringify(result.value);
  }

  // Trim to max size of the field in the DB.
  return stringResult.slice(0, POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PluginRunResource
  extends ReadonlyAttributesType<PluginRunModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PluginRunResource extends BaseResource<PluginRunModel> {
  static model: ModelStatic<PluginRunModel> = PluginRunModel;

  constructor(
    model: ModelStatic<PluginRunModel>,
    blob: Attributes<PluginRunModel>
  ) {
    super(PluginRunModel, blob);
  }

  static async makeNew(
    plugin: Plugin<PluginArgs>,
    args: InferPluginArgs<PluginArgs>,
    author: UserResource,
    workspace: LightWorkspaceType | null,
    pluginResourceTarget: PluginResourceTarget
  ) {
    const sanitizedArgs = redactPluginArgs(plugin, args);

    const pluginRun = await this.model.create({
      args: JSON.stringify(sanitizedArgs),
      author: author.email,
      pluginId: plugin.manifest.id,
      status: "pending",
      workspaceId: workspace?.id,
      resourceType: pluginResourceTarget.resourceType,
      resourceId:
        "resourceId" in pluginResourceTarget
          ? pluginResourceTarget.resourceId
          : null,
    });

    return new this(PluginRunResource.model, pluginRun.get());
  }

  async recordError(error: string) {
    await this.model.update(
      {
        status: "error",
        error: trimPluginRunResultOrError(error),
      },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async recordResult(result: PluginResponse) {
    await this.model.update(
      {
        status: "success",
        result: trimPluginRunResultOrError(result),
      },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    await this.model.destroy({
      where: { workspaceId: workspace.id },
    });
  }
}
