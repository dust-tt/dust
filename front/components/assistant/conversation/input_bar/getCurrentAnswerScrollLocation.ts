type Message = {
  sId: string;
  type: string;
  status?: string;
};

export function getCurrentAnswerScrollLocation(
  messages: Message[],
  currentMessageId: string | undefined
) {
  const currentMessageIndex = messages.findIndex(
    (message) => message.sId === currentMessageId
  );
  const fallbackMessageIndex = messages.findLastIndex(
    (message) =>
      message.type === "agent_message" && message.status === "created"
  );
  const index =
    currentMessageIndex >= 0
      ? currentMessageIndex
      : fallbackMessageIndex >= 0
        ? fallbackMessageIndex
        : ("LAST" as const);

  return { index, align: "end" as const, behavior: "instant" as const };
}
