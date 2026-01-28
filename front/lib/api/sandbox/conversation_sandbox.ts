/**
 * Conversation Sandbox Service
 *
 * Manages sandbox lifecycle per conversation with:
 * - Lazy creation when first needed
 * - Auto-pause after 20 minutes of inactivity
 * - Auto-destroy after 7 days of inactivity
 * - Auto-wake when accessing a paused sandbox
 */

import apiConfig from "@app/lib/api/config";
import type {
  CommandResult,
  Sandbox,
  SandboxError,
} from "@app/lib/api/sandbox/client";
import {
  NorthflankSandboxClient,
  ServiceAlreadyExistsError,
} from "@app/lib/api/sandbox/client";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import {
  signalSandboxActivity,
  startSandboxLifecycleWorkflow,
} from "@app/temporal/sandbox_lifecycle/client";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Generate deterministic service name from conversation sId.
 * Format: csb-{conversationSId}
 */
export function getSandboxServiceName(conversationSId: string): string {
  return `csb-${conversationSId}`;
}

export type SandboxAttachStatus = "created" | "resumed" | "attached";

export interface SandboxAttachResult {
  sandbox: Sandbox;
  status: SandboxAttachStatus;
}

export class ConversationNotFoundError extends Error {
  constructor(conversationSId: string) {
    super(`Conversation "${conversationSId}" not found or access denied`);
    this.name = "ConversationNotFoundError";
  }
}

export type ConversationSandboxError =
  | ConversationNotFoundError
  | SandboxError;

/**
 * Get or create a sandbox for a conversation.
 *
 * - If sandbox doesn't exist: creates it, starts lifecycle workflow
 * - If sandbox exists and running: attaches to it
 * - If sandbox exists and paused: resumes it
 *
 * Access control: Verifies conversation access via ConversationResource.fetchById
 *
 * Returns status indicating what happened:
 * - "created": Fresh sandbox with new filesystem
 * - "resumed": Was paused, now running (filesystem preserved)
 * - "attached": Already running (filesystem preserved)
 */
export async function getOrCreateConversationSandbox(
  auth: Authenticator,
  conversationSId: string
): Promise<Result<SandboxAttachResult, ConversationSandboxError>> {
  // Access control: verify user can access this conversation
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationSId
  );
  if (!conversation) {
    return new Err(new ConversationNotFoundError(conversationSId));
  }

  const serviceName = getSandboxServiceName(conversationSId);
  const client = await getClient();

  // Check if sandbox already exists
  const existingStatus = await client.getServiceByName(serviceName);

  if (existingStatus) {
    const sandbox = client.attach(existingStatus.info);

    if (existingStatus.isPaused) {
      // Resume paused sandbox
      logger.info(
        { conversationSId, serviceName },
        "[conversation-sandbox] Resuming paused sandbox"
      );

      const resumeResult = await sandbox.resume();
      if (resumeResult.isErr()) {
        return resumeResult;
      }

      // Signal activity to reset the lifecycle timer
      await signalSandboxActivity(serviceName);

      return new Ok({ sandbox, status: "resumed" });
    }

    // Already running, just attach
    logger.info(
      { conversationSId, serviceName },
      "[conversation-sandbox] Attaching to running sandbox"
    );

    // Signal activity to reset the lifecycle timer
    await signalSandboxActivity(serviceName);

    return new Ok({ sandbox, status: "attached" });
  }

  // Create new sandbox
  logger.info(
    { conversationSId, serviceName },
    "[conversation-sandbox] Creating new sandbox"
  );

  const createResult = await client.createSandbox(serviceName, {
    workspaceId: auth.getNonNullableWorkspace().sId,
    conversationId: conversationSId,
  });

  if (createResult.isErr()) {
    // Handle race condition: another request created it first
    if (createResult.error instanceof ServiceAlreadyExistsError) {
      logger.info(
        { conversationSId, serviceName },
        "[conversation-sandbox] Service created by another request, attaching"
      );

      // Retry: get the existing service
      const retryStatus = await client.getServiceByName(serviceName);
      if (retryStatus) {
        const sandbox = client.attach(retryStatus.info);

        if (retryStatus.isPaused) {
          const resumeResult = await sandbox.resume();
          if (resumeResult.isErr()) {
            return resumeResult;
          }
          await signalSandboxActivity(serviceName);
          return new Ok({ sandbox, status: "resumed" });
        }

        await signalSandboxActivity(serviceName);
        return new Ok({ sandbox, status: "attached" });
      }
    }

    return createResult;
  }

  // Start lifecycle workflow for the new sandbox
  await startSandboxLifecycleWorkflow(serviceName);

  return new Ok({ sandbox: createResult.value, status: "created" });
}

/**
 * Execute a command in a conversation's sandbox.
 *
 * Handles sandbox lifecycle automatically:
 * - Creates sandbox if needed
 * - Resumes if paused
 * - Signals activity to reset lifecycle timer
 */
export async function executeInConversationSandbox(
  auth: Authenticator,
  conversationSId: string,
  command: string
): Promise<
  Result<
    { result: CommandResult; sandboxStatus: SandboxAttachStatus },
    ConversationSandboxError
  >
> {
  const sandboxResult = await getOrCreateConversationSandbox(
    auth,
    conversationSId
  );

  if (sandboxResult.isErr()) {
    return sandboxResult;
  }

  const { sandbox, status } = sandboxResult.value;
  const result = await sandbox.exec(command);

  // Signal activity after command execution
  const serviceName = getSandboxServiceName(conversationSId);
  await signalSandboxActivity(serviceName);

  return new Ok({ result, sandboxStatus: status });
}

/**
 * Write a file in a conversation's sandbox.
 */
export async function writeFileInConversationSandbox(
  auth: Authenticator,
  conversationSId: string,
  remotePath: string,
  content: string | Buffer
): Promise<
  Result<{ sandboxStatus: SandboxAttachStatus }, ConversationSandboxError>
> {
  const sandboxResult = await getOrCreateConversationSandbox(
    auth,
    conversationSId
  );

  if (sandboxResult.isErr()) {
    return sandboxResult;
  }

  const { sandbox, status } = sandboxResult.value;
  await sandbox.writeFile(remotePath, content);

  // Signal activity after file operation
  const serviceName = getSandboxServiceName(conversationSId);
  await signalSandboxActivity(serviceName);

  return new Ok({ sandboxStatus: status });
}

/**
 * Read a file from a conversation's sandbox.
 */
export async function readFileFromConversationSandbox(
  auth: Authenticator,
  conversationSId: string,
  remotePath: string
): Promise<
  Result<
    { content: Buffer; sandboxStatus: SandboxAttachStatus },
    ConversationSandboxError
  >
> {
  const sandboxResult = await getOrCreateConversationSandbox(
    auth,
    conversationSId
  );

  if (sandboxResult.isErr()) {
    return sandboxResult;
  }

  const { sandbox, status } = sandboxResult.value;
  const content = await sandbox.readFile(remotePath);

  // Signal activity after file operation
  const serviceName = getSandboxServiceName(conversationSId);
  await signalSandboxActivity(serviceName);

  return new Ok({ content, sandboxStatus: status });
}

// Cached client instance
let clientInstance: NorthflankSandboxClient | null = null;

async function getClient(): Promise<NorthflankSandboxClient> {
  if (!clientInstance) {
    const apiToken = apiConfig.getNorthflankApiToken();
    if (!apiToken) {
      throw new Error("NORTHFLANK_API_TOKEN not configured");
    }
    clientInstance = await NorthflankSandboxClient.create(apiToken);
  }
  return clientInstance;
}
