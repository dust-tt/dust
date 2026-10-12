export interface ResponseNavigationState {
  conversationId: string;
  generatingMessageId: string | undefined;
  unseenCompletedMessageId: string | null;
}

/**
 * @cc [owner:id13,label:react;product] completed-answer-stays-unseen
 * A previously generating answer MUST become unseen when generation ends away
 * from the bottom. A new generation, reaching the bottom, or switching
 * conversations MUST clear the unseen answer.
 */
export function getResponseNavigationState(
  state: ResponseNavigationState,
  {
    conversationId,
    generatingMessageId,
    atBottom,
  }: {
    conversationId: string;
    generatingMessageId: string | undefined;
    atBottom: boolean;
  }
): ResponseNavigationState {
  if (state.conversationId !== conversationId) {
    return {
      conversationId,
      generatingMessageId,
      unseenCompletedMessageId: null,
    };
  }

  const unseenCompletedMessageId =
    generatingMessageId || atBottom
      ? null
      : state.generatingMessageId && !generatingMessageId
        ? state.generatingMessageId
        : state.unseenCompletedMessageId;

  if (
    state.generatingMessageId === generatingMessageId &&
    state.unseenCompletedMessageId === unseenCompletedMessageId
  ) {
    return state;
  }

  return { conversationId, generatingMessageId, unseenCompletedMessageId };
}
