import {
  ConversationThreadCore,
  type ConversationThreadCoreProps,
} from "./ConversationThreadCore";

export type GroupThreadConversationViewProps = Omit<
  ConversationThreadCoreProps,
  "variant"
>;

/**
 * Multi-party / project thread: same shell as {@link ConversationView} but agent
 * messages get a bordered container. Not to be confused with {@link GroupConversationView}
 * (space/project hub).
 */
export function GroupThreadConversationView(
  props: GroupThreadConversationViewProps
) {
  return <ConversationThreadCore {...props} variant="groupThread" />;
}
