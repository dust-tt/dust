import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";

interface ToolValidationParams {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  actionId: number;
  approved: "approved" | "rejected";
}

/**
 * Validates a tool execution by calling the validate-action API endpoint.
 */
export async function validateToolExecution({
  workspaceId,
  conversationId,
  messageId,
  actionId,
  approved,
}: ToolValidationParams): Promise<Result<{ success: boolean }, Error>> {
  try {
    logger.info({
      workspaceId,
      conversationId,
      messageId,
      actionId,
      approved,
    }, "Validating tool execution"
    )
    const dustFrontAPIUrl = apiConfig.getDustFrontAPIUrl();
    
    const response = await fetch(
      `${dustFrontAPIUrl}/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/validate-action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionId,
          approved,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error(
        {
          workspaceId,
          conversationId,
          messageId,
          actionId,
          approved,
          status: response.status,
          error: errorData,
        },
        "Error validating tool execution"
      );
      return new Err(
        new Error(
          `Failed to validate tool execution: ${
            errorData.api_error?.message || response.statusText
          }`
        )
      );
    }

    const data = await response.json();
    return new Ok(data);
  } catch (error: unknown) {
    logger.error(
      {
        workspaceId,
        conversationId,
        messageId,
        actionId,
        approved,
        error,
      },
      "Exception validating tool execution"
    );
    return new Err(
      new Error(`Exception validating tool execution: ${(error as Error).message}`)
    );
  }
} 