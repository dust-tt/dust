import type { ValidationRequiredToolExecution } from "@app/components/assistant/conversation/editable_tool_validation/types";

export class ValidationRequiredToolExecutionFactory {
  private static counter = 0;

  static build(
    overrides: Partial<ValidationRequiredToolExecution> = {}
  ): ValidationRequiredToolExecution {
    const id = ++ValidationRequiredToolExecutionFactory.counter;

    return {
      conversationId: "conv_1",
      messageId: "msg_1",
      configurationId: "config_1",
      actionId: `action_${id}`,
      userId: "user_1",
      created: 0,
      metadata: {
        mcpServerName: "server",
        toolName: "tool",
        agentName: "agent",
      },
      inputs: {},
      status: "blocked_validation_required",
      authorizationInfo: null,
      ...overrides,
    };
  }
}
