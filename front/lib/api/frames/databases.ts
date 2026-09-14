import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type {
  LiveDatabaseEntry,
  QueryDatabaseResult,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import {
  listDatabasesOnReadySandbox,
  queryDatabaseOnReadySandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * There is no database-backed record of a Frame's databases: the only source of truth is the live
 * `{db}.db` files in the Frame sandbox, so every operation here wakes (or cold starts) it. Callers
 * are expected to reach for it on explicit action only.
 */
async function readyFrameSandbox(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<SandboxResource, SandboxFunctionError>> {
  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  return new Ok(ensureResult.value.sandbox);
}

export async function listFrameDatabases(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<LiveDatabaseEntry[], SandboxFunctionError>> {
  const sandboxResult = await readyFrameSandbox(auth, frame);
  if (sandboxResult.isErr()) {
    return sandboxResult;
  }
  return listDatabasesOnReadySandbox(auth, sandboxResult.value);
}

/**
 * Run one SQL statement (SELECT or DML) against a Frame database. Oversized results come back as
 * a bounded inline preview: the caller is not on the Frame sandbox and could not read a spill file.
 */
export async function queryFrameDatabase(
  auth: Authenticator,
  frame: FileResource,
  { database, sql }: { database: string; sql: string }
): Promise<Result<QueryDatabaseResult, SandboxFunctionError>> {
  const sandboxResult = await readyFrameSandbox(auth, frame);
  if (sandboxResult.isErr()) {
    return sandboxResult;
  }
  return queryDatabaseOnReadySandbox(auth, {
    sandbox: sandboxResult.value,
    database,
    sql,
  });
}
