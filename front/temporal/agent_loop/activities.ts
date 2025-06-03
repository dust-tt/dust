export async function planActivity({
  agentMessageId,
  step,
}: {
  agentMessageId: string;
  step: number;
}): Promise<number> {
  void agentMessageId;
  void step;
  return 0;
}

export async function runToolActivity({
  agentMessageId,
  step,
  index,
}: {
  agentMessageId: string;
  step: number;
  index: number;
}): Promise<void> {
  void agentMessageId;
  void step;
  void index;
}
