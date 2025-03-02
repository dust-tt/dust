// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type { LightWorkspaceType, PluginArgs, UserType } from "@dust-tt/types";
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
import { PluginRunModel } from "@app/lib/resources/storage/models/plugin_runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

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
    author: UserType,
    workspace: LightWorkspaceType | null
  ) {
    const sanitizedArgs = redactPluginArgs(plugin, args);

    const pluginRun = await this.model.create({
      args: JSON.stringify(sanitizedArgs),
      author: author.email,
      pluginId: plugin.manifest.id,
      status: "pending",
      workspaceId: workspace?.id,
    });

    return new this(PluginRunResource.model, pluginRun.get());
  }

  async recordError(error: string) {
    await this.model.update(
      {
        status: "error",
        error,
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
        result: JSON.stringify(result),
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

  // toJSON(): KeyType {
  //   // We only display the full secret key for the first 10 minutes after creation.
  //   const currentTime = new Date();
  //   const createdAt = new Date(this.createdAt);
  //   const timeDifference = Math.abs(
  //     currentTime.getTime() - createdAt.getTime()
  //   );
  //   const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
  //   const secret =
  //     differenceInMinutes > 10 ? redactString(this.secret, 4) : this.secret;

  //   return {
  //     id: this.id,
  //     createdAt: this.createdAt.getTime(),
  //     lastUsedAt: this.lastUsedAt?.getTime() ?? null,
  //     creator: formatUserFullName(this.user),
  //     name: this.name,
  //     secret,
  //     status: this.status,
  //     groupId: this.groupId,
  //   };
  // }
}
