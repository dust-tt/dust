import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import {
  GongConfigurationModel,
  GongTranscriptModel,
  GongUserModel,
} from "@connectors/lib/models/gong";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorResource } from "@connectors/resources/connector_resource"; // Attributes are marked as read-only to reflect the stateless nature of our Resource.
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import { normalizeError } from "@connectors/types";

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000;
}

const GC_FREQUENCY_MS = daysToMs(1); // Every day.
// Transcripts are searched based on start time of the call.
// The delay needs to be greater than meeting duration + Gong processing time.
// We use 3 hours as a semi-arbitrary upper bound for the delay.
const TRANSCRIPT_DELAY_TIME_UPPER_BOUND_MS = hoursToMs(3);

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GongConfigurationResource
  extends ReadonlyAttributesType<GongConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GongConfigurationResource extends BaseResource<GongConfigurationModel> {
  static model: ModelStatic<GongConfigurationModel> = GongConfigurationModel;

  constructor(
    model: ModelStatic<GongConfigurationModel>,
    blob: Attributes<GongConfigurationModel>
  ) {
    super(GongConfigurationModel, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<GongConfigurationModel>;
    transaction?: Transaction;
  }): Promise<GongConfigurationResource> {
    const configuration = await GongConfigurationModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastSyncTimestamp: this.lastSyncTimestamp,
      baseUrl: this.baseUrl,
      retentionPeriodDays: this.retentionPeriodDays,
      lastGarbageCollectionTimestamp: this.lastGarbageCollectionTimestamp,
    };
  }

  static async fetchByConnector(
    connector: ConnectorResource
  ): Promise<GongConfigurationResource | null> {
    const configuration = await GongConfigurationModel.findOne({
      where: { connectorId: connector.id },
    });
    if (!configuration) {
      return null;
    }

    return new this(this.model, configuration.get());
  }

  async setTrackersEnabled(trackersEnabled: boolean): Promise<void> {
    await this.update({
      trackersEnabled,
    });
  }

  async setAccountsEnabled(accountsEnabled: boolean): Promise<void> {
    await this.update({
      accountsEnabled,
    });
  }

  async resetLastSyncTimestamp(): Promise<void> {
    await this.update({
      lastSyncTimestamp: null,
    });
  }

  async setLastSyncTimestamp(timestamp: number): Promise<void> {
    await this.update({
      lastSyncTimestamp: timestamp,
    });
  }

  async setRetentionPeriodDays(
    retentionPeriodDays: number | null
  ): Promise<void> {
    await this.update({
      retentionPeriodDays,
    });
  }

  /**
   * Returns the timestamp to start syncing from.
   * Offsets the last sync timestamp by an upper bound on the transcript processing time to make sure we do not miss
   * transcripts that Gong did not process yet.
   */
  getSyncStartTimestamp() {
    if (this.retentionPeriodDays) {
      if (!this.lastSyncTimestamp) {
        return Date.now() - daysToMs(this.retentionPeriodDays);
      }
      return Math.max(
        this.lastSyncTimestamp - TRANSCRIPT_DELAY_TIME_UPPER_BOUND_MS,
        Date.now() - daysToMs(this.retentionPeriodDays)
      );
    }
    if (this.lastSyncTimestamp) {
      return this.lastSyncTimestamp - TRANSCRIPT_DELAY_TIME_UPPER_BOUND_MS;
    }
    return this.lastSyncTimestamp;
  }

  checkGarbageCollectionState({
    currentTimestamp,
  }: {
    currentTimestamp: number;
  }): { shouldRunGarbageCollection: boolean } {
    // If we have no retention period policy, we never run the garbage collection.
    if (this.retentionPeriodDays === null) {
      return { shouldRunGarbageCollection: false };
    }
    // If we never ran the GC, we run it (handles retention period changes).
    if (this.lastGarbageCollectionTimestamp === null) {
      return { shouldRunGarbageCollection: true };
    }
    return {
      shouldRunGarbageCollection:
        currentTimestamp - this.lastGarbageCollectionTimestamp >
        GC_FREQUENCY_MS,
    };
  }

  async setLastGarbageCollectionTimestamp(timestamp: number): Promise<void> {
    await this.update({
      lastGarbageCollectionTimestamp: timestamp,
    });
  }
}

export type GongUserBlob = Omit<
  CreationAttributes<GongUserModel>,
  "connectorId" | "id"
>;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GongUserResource
  extends ReadonlyAttributesType<GongUserModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GongUserResource extends BaseResource<GongUserModel> {
  static model: ModelStatic<GongUserModel> = GongUserModel;

  constructor(
    model: ModelStatic<GongUserModel>,
    blob: Attributes<GongUserModel>
  ) {
    super(GongUserModel, blob);
  }

  static async makeNew(
    connector: ConnectorResource,
    blob: GongUserBlob,
    transaction?: Transaction
  ): Promise<GongUserResource> {
    const user = await GongUserModel.create(
      { ...blob },
      transaction && { transaction }
    );

    return new this(this.model, user.get());
  }

  static async batchCreate(
    connector: ConnectorResource,
    usersBlobs: GongUserBlob[]
  ): Promise<GongUserResource[]> {
    const users = await GongUserModel.bulkCreate(
      usersBlobs.map((user) => ({
        ...user,
        connectorId: connector.id,
      })),
      {
        updateOnDuplicate: ["firstName", "lastName", "email"],
      }
    );

    return users.map((user) => new this(this.model, user.get()));
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });
    } catch (error) {
      return new Err(normalizeError(error));
    }

    return new Ok(undefined);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  toJSON(): Record<string, unknown> {
    return {
      createdAt: this.createdAt,
      email: this.email,
      firstName: this.firstName,
      gongId: this.gongId,
      id: this.id,
      lastName: this.lastName,
      updatedAt: this.updatedAt,
    };
  }

  static async fetchByGongUserIds(
    connector: ConnectorResource,
    { gongUserIds }: { gongUserIds: string[] }
  ): Promise<GongUserResource[]> {
    const users = await GongUserModel.findAll({
      where: { connectorId: connector.id, gongId: gongUserIds },
    });

    return users.map((user) => new this(this.model, user.get()));
  }

  static async fetchByGongUserId(
    connector: ConnectorResource,
    { gongUserId }: { gongUserId: string }
  ): Promise<GongUserResource | null> {
    const [user] = await this.fetchByGongUserIds(connector, {
      gongUserIds: [gongUserId],
    });

    return user ?? null;
  }
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GongTranscriptResource
  extends ReadonlyAttributesType<GongTranscriptModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GongTranscriptResource extends BaseResource<GongTranscriptModel> {
  static model: ModelStatic<GongTranscriptModel> = GongTranscriptModel;

  constructor(
    model: ModelStatic<GongTranscriptModel>,
    blob: Attributes<GongTranscriptModel>
  ) {
    super(GongTranscriptModel, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<GongTranscriptModel>;
    transaction?: Transaction;
  }): Promise<GongTranscriptResource> {
    const configuration = await GongTranscriptModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      callId: this.callId,
      title: this.title,
      url: this.url,
    };
  }

  static async fetchByCallIds(
    callIds: string[],
    connector: ConnectorResource
  ): Promise<GongTranscriptResource[]> {
    const transcripts = await GongTranscriptModel.findAll({
      where: {
        callId: callIds,
        connectorId: connector.id,
      },
    });

    return transcripts.map((t) => new this(this.model, t.get()));
  }

  static async fetchByCallId(
    callId: string,
    connector: ConnectorResource
  ): Promise<GongTranscriptResource | null> {
    const transcript = await GongTranscriptModel.findOne({
      where: {
        callId,
        connectorId: connector.id,
      },
    });
    if (!transcript) {
      return null;
    }

    return new this(this.model, transcript.get());
  }

  static async fetchOutdated(
    connector: ConnectorResource,
    configuration: GongConfigurationResource,
    {
      garbageCollectionStartTs,
      limit,
    }: { garbageCollectionStartTs: number; limit: number }
  ): Promise<GongTranscriptResource[]> {
    // If the retention period is not defined, we keep all transcripts.
    if (configuration.retentionPeriodDays === null) {
      return [];
    }

    const retentionPeriodStart =
      garbageCollectionStartTs - daysToMs(configuration.retentionPeriodDays);
    const transcripts = await GongTranscriptModel.findAll({
      where: {
        connectorId: connector.id,
        callDate: {
          [Op.lt]: retentionPeriodStart,
        },
      },
      limit,
    });
    return transcripts.map((t) => new this(this.model, t.get()));
  }

  static async batchDelete(
    connector: ConnectorResource,
    transcripts: GongTranscriptResource[]
  ): Promise<void> {
    await GongTranscriptModel.destroy({
      where: {
        callId: transcripts.map((t) => t.callId),
        connectorId: connector.id,
      },
    });
  }
}
