export async function planActivity({
  agentMessageId,
  conversationId,
  step,
}: {
  agentMessageId: number;
  conversationId: string;
  step: number;
}): Promise<
  | {
      maxStepsExhausted: true;
      toolCallsCount: 0;
    }
  | {
      maxStepsExhausted: false;
      toolCallsCount: number;
    }
> {
  void agentMessageId;
  void conversationId;
  void step;
  return {
    maxStepsExhausted: false,
    toolCallsCount: 0,
  };
}

export async function runToolActivity({
  agentMessageId,
  conversationId,
  step,
  index,
}: {
  agentMessageId: number;
  conversationId: string;
  step: number;
  index: number;
}): Promise<void> {
  void agentMessageId;
  void conversationId;
  void step;
  void index;
}
