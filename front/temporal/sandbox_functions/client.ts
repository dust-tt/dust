import type { Authenticator } from "@app/lib/auth";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/sandbox_functions/config";
import {
  makeRetiredFramePublicationCleanupWorkflowId,
  makeSandboxFunctionInvocationWorkflowId,
  makeSandboxFunctionToolWorkflowId,
} from "@app/temporal/sandbox_functions/lib/workflow_ids";
import {
  cleanupRetiredFramePublicationWorkflow,
  runSandboxFunctionInvocationWorkflow,
  runSandboxFunctionToolWorkflow,
} from "@app/temporal/sandbox_functions/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

export async function launchRetiredFramePublicationCleanupWorkflow({
  frameId,
  publicationId,
  workspaceId,
}: {
  frameId: string;
  publicationId: string;
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const workflowId = makeRetiredFramePublicationCleanupWorkflowId({
    workspaceId,
    frameId,
    publicationId,
  });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.start(cleanupRetiredFramePublicationWorkflow, {
      args: [{ frameId, publicationId, workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        workspaceId: [workspaceId],
      },
      memo: {
        frameId,
        publicationId,
        workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return new Ok(undefined);
    }
    return new Err(normalizeError(error));
  }

  return new Ok(undefined);
}

export async function launchSandboxFunctionToolWorkflow(
  auth: Authenticator,
  { action }: { action: SandboxFunctionMCPActionResource }
): Promise<Result<undefined, Error>> {
  const authType = auth.toJSON();
  const { workspaceId } = authType;

  const workflowId = makeSandboxFunctionToolWorkflowId({
    workspaceId,
    actionModelId: action.id,
  });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.start(runSandboxFunctionToolWorkflow, {
      args: [{ authType, actionModelId: action.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        workspaceId: [workspaceId],
      },
      memo: {
        workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      // Idempotent: another caller already kicked it off for this action.
      return new Ok(undefined);
    }
    return new Err(normalizeError(error));
  }

  return new Ok(undefined);
}

export async function launchSandboxFunctionInvocationWorkflow(
  auth: Authenticator,
  {
    sandboxFunction,
    invocation,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocation: SandboxFunctionInvocationResource;
  }
): Promise<Result<undefined, Error>> {
  const authType = auth.toJSON();
  const { workspaceId } = authType;
  const workflowId = makeSandboxFunctionInvocationWorkflowId({
    workspaceId,
    invocationId: invocation.sId,
  });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.start(runSandboxFunctionInvocationWorkflow, {
      args: [
        {
          authType,
          sandboxFunctionId: sandboxFunction.sId,
          invocationId: invocation.sId,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        workspaceId: [workspaceId],
      },
      memo: {
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
        workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return new Ok(undefined);
    }
    return new Err(normalizeError(error));
  }

  return new Ok(undefined);
}
