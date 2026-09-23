import { randomBytes } from "node:crypto";

import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { renderSandboxEnvVarName } from "@app/lib/api/sandbox/env_vars";
import type { AuditLogActor } from "@app/lib/api/workos/organization";
import { PLACEHOLDER_NONCE_BYTES } from "@app/lib/resources/sandbox_env_var_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { literal, Op, QueryTypes } from "sequelize";

const AUDIT_ACTOR: AuditLogActor = {
  type: "system",
  id: "sandbox-https-secret-nonce-repair",
  name: "Sandbox HTTPS secret nonce repair",
};
const AUDIT_EMIT_CONCURRENCY = 4;

// Regenerates the placeholder nonce of HTTPS secret sandbox env vars
// (workspace_sandbox_env_vars.placeholder_nonce) whose bytea value is not 16
// bytes. Workspace relocation serialized the Buffer through JSON, so the
// destination stored the JSON text `{"type":"Buffer","data":[...]}` as bytes
// and the rendered `__DSEC_<160hex>__` placeholder is rejected by dsbx.
//
// The nonce is not key material and is only rendered at sandbox start (env
// manifest and egress-secrets file), so a fresh random value restores the
// secret. Sandboxes already running for an affected workspace need a restart.
//
// Usage (from `front/`):
//   npx tsx -r tsconfig-paths/register migrations/20260922_fix_malformed_sandbox_https_secret_nonces.ts [--wId <sId>] [--execute]

export async function fixWorkspaceNonces(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<number> {
  // The attribute maps to a snake_case column; literal() bypasses that
  // mapping. The attribute always declares `field`, the fallback only narrows
  // the type.
  const nonceColumn =
    SandboxEnvVarModel.getAttributes().placeholderNonce.field ??
    "placeholderNonce";
  const rows = await SandboxEnvVarModel.findAll({
    where: {
      workspaceId: workspace.id,
      kind: "https_secret",
      [Op.and]: [
        literal(`octet_length("${nonceColumn}") <> ${PLACEHOLDER_NONCE_BYTES}`),
      ],
    },
  });

  for (const row of rows) {
    logger.info(
      {
        workspaceId: workspace.sId,
        sandboxEnvVarModelId: row.id,
        spaceModelId: row.spaceId,
        name: row.name,
        nonceBytes: row.placeholderNonce?.length ?? null,
      },
      execute
        ? "Regenerating malformed placeholder nonce"
        : "Would regenerate malformed placeholder nonce"
    );
  }

  if (!execute || rows.length === 0) {
    return rows.length;
  }

  // One statement for the workspace: each row gets its own nonce through
  // parallel unnest arrays.
  await frontSequelize.query(
    `UPDATE "${SandboxEnvVarModel.tableName}" AS v
     SET "${nonceColumn}" = repairs.nonce, "updatedAt" = NOW()
     FROM (
       SELECT
         unnest(ARRAY[:ids]::bigint[]) AS id,
         unnest(ARRAY[:nonces]::bytea[]) AS nonce
     ) AS repairs
     WHERE v.id = repairs.id AND v."workspaceId" = :workspaceId`,
    {
      replacements: {
        ids: rows.map((row) => row.id),
        nonces: rows.map(() => randomBytes(PLACEHOLDER_NONCE_BYTES)),
        workspaceId: workspace.id,
      },
      type: QueryTypes.UPDATE,
    }
  );

  // emitAuditLogEventDirect never throws. Awaited (bounded) rather than
  // fire-and-forget because makeScript exits the process as soon as this
  // returns, which would drop pending emits.
  await concurrentExecutor(
    rows,
    async (row) => {
      const envName = renderSandboxEnvVarName({
        kind: row.kind,
        name: row.name,
      });
      await emitAuditLogEventDirect({
        workspace,
        action: "sandbox_env_var.updated",
        actor: AUDIT_ACTOR,
        targets: [
          buildAuditLogTarget("workspace", workspace),
          buildAuditLogTarget("sandbox_env_var", {
            sId: makeSId("sandbox_env_var", {
              id: row.id,
              workspaceId: workspace.id,
            }),
            name: envName,
          }),
        ],
        context: { location: "internal" },
        // Same keys as SandboxEnvVarResource's update emit, so the registered
        // schema needs no change.
        metadata: {
          name: envName,
          kind: row.kind,
          allowed_domains: JSON.stringify(row.allowedDomains ?? []),
          ...(row.spaceId !== null
            ? {
                space_id: SpaceResource.modelIdToSId({
                  id: row.spaceId,
                  workspaceId: workspace.id,
                }),
              }
            : {}),
          previously_existed: "true",
        },
      });
    },
    { concurrency: AUDIT_EMIT_CONCURRENCY }
  );

  return rows.length;
}

if (
  process.argv[1]?.endsWith(
    "20260922_fix_malformed_sandbox_https_secret_nonces.ts"
  )
) {
  makeScript(
    {
      wId: {
        type: "string",
        describe: "Only fix this workspace (sId); defaults to all workspaces",
      },
    },
    async ({ execute, wId }, logger) => {
      let malformed = 0;

      await runOnAllWorkspaces(
        async (workspace) => {
          malformed += await fixWorkspaceNonces(workspace, {
            execute,
            logger,
          });
        },
        { wId, concurrency: 4 }
      );

      logger.info(
        { malformed, execute },
        execute
          ? "Malformed HTTPS secret nonces regenerated"
          : "Dry run complete (nothing written; `malformed` counts rows that would be regenerated)"
      );
    }
  );
}
