// biome-ignore-all lint/plugin/noRawSql: destination normalization resolves IDs from relocation SQL

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type {
  CoreEntitiesRelocationBlob,
  RelocationStatement,
} from "@app/temporal/relocation/activities/types";
import {
  getRelocationStoragePath,
  readFromRelocationStorage,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { getUserReferencingColumns } from "@app/temporal/relocation/lib/sql/schema/introspection";
import type { RegionType } from "@app/types/region";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op, QueryTypes } from "sequelize";

type SerializedIdMapping = Record<string, ModelId>;

export interface DestinationIdNormalizationRule {
  idMapping: SerializedIdMapping;
  columnsByTable: Record<string, string[]>;
}

export interface DestinationIdNormalization {
  rules: DestinationIdNormalizationRule[];
}

interface EntityIdentity {
  id: ModelId;
  stableId: string | null;
}

const DESTINATION_ID_NORMALIZATION_OPERATION = "destination_id_normalization";

function getStatementColumns({ columns, sql }: RelocationStatement): string[] {
  if (columns && columns.length > 0) {
    return columns;
  }

  const columnsMatch = sql.match(/^INSERT INTO "[^"]+" \(([^)]+)\) VALUES /);
  if (!columnsMatch?.[1]) {
    throw new Error(
      "Relocation statement columns are required for destination normalization."
    );
  }

  return columnsMatch[1].split(",").map((column) => {
    const quotedColumn = column.trim();
    if (!quotedColumn.startsWith('"') || !quotedColumn.endsWith('"')) {
      throw new Error(
        "Relocation statement contains an invalid column declaration."
      );
    }

    return quotedColumn.slice(1, -1);
  });
}

function getDestinationIdNormalizationFileName({
  destRegion,
  sourceRegion,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
}) {
  return `${sourceRegion}-${destRegion}`;
}

export function buildIdMapping(
  sourceEntities: EntityIdentity[],
  destinationEntities: EntityIdentity[]
): SerializedIdMapping {
  const destinationIdsByStableId = new Map(
    destinationEntities.flatMap(({ id, stableId }) =>
      stableId ? [[stableId, id]] : []
    )
  );

  return Object.fromEntries(
    sourceEntities.flatMap(({ id, stableId }) => {
      const destinationId = stableId
        ? destinationIdsByStableId.get(stableId)
        : undefined;

      return destinationId !== undefined && destinationId !== id
        ? [[id.toString(), destinationId] as const]
        : [];
    })
  );
}

export function extractRowsFromStatements(
  statements: RelocationStatement[]
): Record<string, any>[] {
  return statements.flatMap((statement) => {
    const columns = getStatementColumns(statement);
    const { params } = statement;
    if (params.length % columns.length !== 0) {
      throw new Error(
        "Relocation statement parameters do not match its columns."
      );
    }

    const rows: Record<string, any>[] = [];
    for (let offset = 0; offset < params.length; offset += columns.length) {
      rows.push(
        Object.fromEntries(
          columns.map((column, index) => [column, params[offset + index]])
        )
      );
    }
    return rows;
  });
}

export function normalizeStatements({
  normalization,
  statements,
  tableName,
}: {
  normalization: DestinationIdNormalization;
  statements: RelocationStatement[];
  tableName: string;
}): RelocationStatement[] {
  const mappingsByColumn = new Map<string, SerializedIdMapping>();
  for (const { columnsByTable, idMapping } of normalization.rules) {
    for (const column of columnsByTable[tableName] ?? []) {
      if (mappingsByColumn.has(column)) {
        throw new Error(
          `Multiple destination ID normalization rules target ${tableName}.${column}.`
        );
      }
      mappingsByColumn.set(column, idMapping);
    }
  }

  if (mappingsByColumn.size === 0) {
    return statements;
  }

  return statements.map((statement) => {
    const columns = getStatementColumns(statement);

    let updatedParams: any[] | null = null;
    for (let index = 0; index < statement.params.length; index++) {
      const column = columns[index % columns.length];
      const idMapping = mappingsByColumn.get(column);
      const value = statement.params[index];
      if (!idMapping || value === null || value === undefined) {
        continue;
      }

      const mappedValue = idMapping[value.toString()];
      if (mappedValue !== undefined) {
        updatedParams ??= [...statement.params];
        updatedParams[index] = mappedValue;
      }
    }

    return updatedParams ? { ...statement, params: updatedParams } : statement;
  });
}

async function buildUserIdNormalizationRule(
  statements: RelocationStatement[]
): Promise<DestinationIdNormalizationRule | null> {
  const sourceUsers = extractRowsFromStatements(statements).map((user) => ({
    id: user.id as ModelId,
    stableId: user.workOSUserId as string | null,
  }));
  const workOSUserIds = removeNulls(
    sourceUsers.map(({ stableId }) => stableId)
  );
  const existingUsers =
    workOSUserIds.length > 0
      ? await UserModel.findAll({
          attributes: ["id", "workOSUserId"],
          where: { workOSUserId: { [Op.in]: workOSUserIds } },
          raw: true,
        })
      : [];
  const userIdMapping = buildIdMapping(
    sourceUsers,
    existingUsers.map((user) => ({
      id: user.id,
      stableId: user.workOSUserId,
    }))
  );
  if (Object.keys(userIdMapping).length === 0) {
    return null;
  }

  return {
    idMapping: userIdMapping,
    columnsByTable: await getUserReferencingColumns(frontSequelize),
  };
}

async function buildPlanIdNormalizationRule(
  statements: RelocationStatement[]
): Promise<DestinationIdNormalizationRule | null> {
  const sourcePlans = extractRowsFromStatements(statements).map((plan) => ({
    id: plan.id as ModelId,
    stableId: plan.code as string,
  }));
  const planCodes = sourcePlans.map(({ stableId }) => stableId);
  const existingPlans =
    planCodes.length > 0
      ? await frontSequelize.query<{ code: string; id: ModelId }>(
          "SELECT id, code FROM plans WHERE code IN (:codes)",
          {
            replacements: { codes: planCodes },
            type: QueryTypes.SELECT,
            raw: true,
          }
        )
      : [];
  const planIdMapping = buildIdMapping(
    sourcePlans,
    existingPlans.map((plan) => ({
      id: plan.id,
      stableId: plan.code,
    }))
  );
  if (Object.keys(planIdMapping).length === 0) {
    return null;
  }

  return {
    idMapping: planIdMapping,
    columnsByTable: { subscriptions: ["planId"] },
  };
}

export async function buildDestinationIdNormalization({
  blob,
}: {
  blob: CoreEntitiesRelocationBlob;
}): Promise<DestinationIdNormalization> {
  const userRule = await buildUserIdNormalizationRule(blob.statements.users);
  const planRule = await buildPlanIdNormalizationRule(blob.statements.plans);

  return {
    rules: removeNulls([userRule, planRule]),
  };
}

export async function writeDestinationIdNormalization({
  destRegion,
  normalization,
  sourceRegion,
  workspaceId,
}: {
  destRegion: RegionType;
  normalization: DestinationIdNormalization;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<void> {
  await writeToRelocationStorage(normalization, {
    workspaceId,
    type: "front",
    operation: DESTINATION_ID_NORMALIZATION_OPERATION,
    fileName: getDestinationIdNormalizationFileName({
      destRegion,
      sourceRegion,
    }),
  });
}

export async function readDestinationIdNormalization({
  destRegion,
  sourceRegion,
  workspaceId,
}: {
  destRegion: RegionType;
  sourceRegion: RegionType;
  workspaceId: string;
}): Promise<DestinationIdNormalization> {
  const dataPath = getRelocationStoragePath({
    workspaceId,
    type: "front",
    operation: DESTINATION_ID_NORMALIZATION_OPERATION,
    fileName: getDestinationIdNormalizationFileName({
      destRegion,
      sourceRegion,
    }),
  });

  return readFromRelocationStorage<DestinationIdNormalization>(dataPath);
}
