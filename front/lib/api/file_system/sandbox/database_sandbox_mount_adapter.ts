import { randomBytes } from "node:crypto";

import config from "@app/lib/api/config";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type {
  FileSystemMount,
  SandboxOnlyMount,
} from "@app/lib/api/file_system/types";
import { generateSandboxFileSystemToken } from "@app/lib/api/sandbox/access_tokens";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import type { SandboxMountAdapter } from "./sandbox_mount_adapter";

const FILE_SYSTEM_DIRECTORY = "/run/dust-filesystem";
const TOKEN_PATH = `${FILE_SYSTEM_DIRECTORY}/token`;
const STAGING_DIRECTORY = `${FILE_SYSTEM_DIRECTORY}/staging`;
const LOG_PATH = `${FILE_SYSTEM_DIRECTORY}/daemon.log`;
const PID_PATH = `${FILE_SYSTEM_DIRECTORY}/daemon.pid`;
const MOUNT_POINT = "/files";
const MOUNT_TIMEOUT_MS = 30_000;

export class DatabaseSandboxMountAdapter implements SandboxMountAdapter {
  constructor(
    private readonly mounts: ReadonlyArray<FileSystemMount>,
    private readonly sandboxOnlyMounts: ReadonlyArray<SandboxOnlyMount>
  ) {}

  private tokenRoots(): { conversationId?: string; spaceId?: string } {
    const conversation = this.mounts.find(
      (mount) => mount.kind === "conversation"
    );
    const pod = this.mounts.find((mount) => mount.kind === "pod");
    return {
      ...(conversation ? { conversationId: conversation.id } : {}),
      ...(pod ? { spaceId: pod.id } : {}),
    };
  }

  private async writeToken(
    auth: Authenticator,
    sandbox: SandboxResource
  ): Promise<Result<void, Error>> {
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      ...this.tokenRoots(),
    });
    const temporaryPath = `${FILE_SYSTEM_DIRECTORY}/.token-${randomBytes(8).toString("hex")}`;
    const result = await sandbox.execRoot(
      auth,
      rootCommand.and([
        rootCommand.exec("/usr/bin/install", [
          "-d",
          "-o",
          "root",
          "-g",
          "root",
          "-m",
          "700",
          FILE_SYSTEM_DIRECTORY,
        ]),
        rootCommand.exec("/usr/bin/install", [
          "-o",
          "root",
          "-g",
          "root",
          "-m",
          "600",
          "/dev/stdin",
          temporaryPath,
        ]),
        rootCommand.exec("/usr/bin/mv", [temporaryPath, TOKEN_PATH]),
      ]),
      { stdin: token }
    );
    if (result.isErr()) {
      return result;
    }
    return result.value.exitCode === 0
      ? new Ok(undefined)
      : new Err(
          new Error(
            `Failed to write filesystem token: ${result.value.stderr || result.value.stdout}`
          )
        );
  }

  private auxiliaryAdapter(auth: Authenticator): SandboxMountAdapter {
    return new GCSFileSystemBackend(
      auth.getNonNullableWorkspace().sId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    ).createSandboxAdapter([], this.sandboxOnlyMounts);
  }

  async setup(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    if (!image.hasCapability("dust_filesystem")) {
      await sandbox.requestKill();
      return new Err(
        new Error("Sandbox image does not contain the Dust filesystem daemon.")
      );
    }

    const tokenResult = await this.writeToken(auth, sandbox);
    if (tokenResult.isErr()) {
      return tokenResult;
    }

    if (this.sandboxOnlyMounts.length > 0) {
      const auxiliaryResult = await this.auxiliaryAdapter(auth).setup(
        auth,
        sandbox,
        image
      );
      if (auxiliaryResult.isErr()) {
        return auxiliaryResult;
      }
    }

    const apiUrl = config.getDustAPIConfig().url;
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const startResult = await traceSandboxStartupPhase(
      "filesystem.database_mount",
      () =>
        sandbox.execRoot(
          auth,
          rootCommand.unsafeShell(
            `/usr/bin/mkdir -p ${STAGING_DIRECTORY} ${MOUNT_POINT}; ` +
              `/usr/bin/chmod 700 ${STAGING_DIRECTORY}; ` +
              `if /usr/bin/mountpoint -q ${MOUNT_POINT}; then exit 0; fi; ` +
              `(/usr/bin/nohup /opt/bin/dsbx filesystem mount ` +
              `--mountpoint ${MOUNT_POINT} ` +
              `--staging-dir ${STAGING_DIRECTORY} ` +
              `--api-url '${apiUrl}' ` +
              `--workspace-id '${workspaceId}' ` +
              `--token-file ${TOKEN_PATH} >${LOG_PATH} 2>&1 & ` +
              `/usr/bin/printf '%s' $! >${PID_PATH}); ` +
              `i=0; while [ $i -lt 200 ]; do ` +
              `if /usr/bin/mountpoint -q ${MOUNT_POINT}; then exit 0; fi; ` +
              `if [ -s ${PID_PATH} ] && ! /usr/bin/kill -0 "$(/usr/bin/cat ${PID_PATH})" 2>/dev/null; then ` +
              `/usr/bin/cat ${LOG_PATH} >&2; exit 1; fi; ` +
              `/usr/bin/sleep 0.05; i=$((i+1)); done; ` +
              `/usr/bin/printf 'Dust filesystem mount timed out\n' >&2; ` +
              `/usr/bin/cat ${LOG_PATH} >&2; exit 1`,
            "Start the Dust filesystem daemon and wait for /files to mount"
          ),
          { timeoutMs: MOUNT_TIMEOUT_MS }
        ),
      { sandbox_id: sandbox.sId }
    );
    if (startResult.isErr()) {
      return startResult;
    }
    if (startResult.value.exitCode !== 0) {
      logger.error(
        {
          sandboxId: sandbox.sId,
          workspaceId,
          stderr: startResult.value.stderr,
          stdout: startResult.value.stdout,
        },
        "Dust filesystem daemon failed to mount"
      );
      return new Err(
        new Error(
          `Dust filesystem daemon failed: ${startResult.value.stderr || startResult.value.stdout}`
        )
      );
    }

    logger.info(
      { sandboxId: sandbox.sId, workspaceId },
      "Dust filesystem mounted"
    );
    return new Ok(undefined);
  }

  async refreshCredential(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    if (!image.hasCapability("dust_filesystem")) {
      await sandbox.requestKill();
      return new Err(
        new Error("Sandbox image does not contain the Dust filesystem daemon.")
      );
    }
    const tokenResult = await this.writeToken(auth, sandbox);
    if (tokenResult.isErr()) {
      return tokenResult;
    }
    if (this.sandboxOnlyMounts.length === 0) {
      return new Ok(undefined);
    }
    return this.auxiliaryAdapter(auth).refreshCredential(auth, sandbox, image);
  }
}
