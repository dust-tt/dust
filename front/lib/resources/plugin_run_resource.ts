// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type {
  AllPlugins,
  InferPluginArgsAtExecution,
  PluginResponse,
} from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  PluginRunModel,
  POKE_PLUGIN_RUN_MAX_ARGS_LENGTH,
  POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH,
} from "@app/lib/resources/storage/models/plugin_runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  LightWorkspaceType,
  PluginArgs,
  PluginResourceTarget,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { PluginRunType } from "@app/types/poke/plugins";

import type { UserResource } from "./user_resource";

function redactPluginArgs(
  plugin: AllPlugins,
  args: InferPluginArgsAtExecution<PluginArgs>
) {
  const sanitizedArgs: Record<string, unknown> = {};

  for (const [key, argDef] of Object.entries(plugin.manifest.args)) {
    const arg = args[key];
    if (argDef.redact) {
      sanitizedArgs[key] = "REDACTED";
    } else if (
      argDef.type === "file" &&
      typeof arg === "object" &&
      "originalFilename" in arg
    ) {
      sanitizedArgs[key] = arg.originalFilename;
    } else {
      sanitizedArgs[key] = arg;
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
    plugin: AllPlugins,
    args: InferPluginArgsAtExecution<PluginArgs>,
    author: UserResource,
    workspace: LightWorkspaceType | null,
    pluginResourceTarget: PluginResourceTarget
  ) {
    const sanitizedArgs = redactPluginArgs(plugin, args);

    const pluginRun = await this.model.create({
      args: JSON.stringify(sanitizedArgs).slice(
        0,
        POKE_PLUGIN_RUN_MAX_ARGS_LENGTH
      ),
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

  static async findByWorkspaceId(auth: Authenticator) {
    const workspace = auth.workspace();

    const pluginRuns = await this.model.findAll({
      where: {
        workspaceId: workspace?.id ?? null,
      },
      order: [["createdAt", "DESC"]],
    });

    return pluginRuns.map(
      (pluginRun) => new this(PluginRunResource.model, pluginRun.get())
    );
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
      return new Err(normalizeError(err));
    }
  }

  toJSON(): PluginRunType {
    return {
      createdAt: this.createdAt.getTime(),
      author: this.author,
      pluginId: this.pluginId,
      status: this.status,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      args: this.args ? JSON.parse(this.args) : {},
    };
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    await this.model.destroy({
      where: { workspaceId: workspace.id },
    });
  }
}
