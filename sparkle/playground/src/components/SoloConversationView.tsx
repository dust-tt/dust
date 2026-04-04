import {
  ConversationThreadCore,
  type ConversationThreadCoreProps,
} from "./ConversationThreadCore";

export type SoloConversationViewProps = Omit<
  ConversationThreadCoreProps,
  "variant"
>;

export function SoloConversationView(props: SoloConversationViewProps) {
  return <ConversationThreadCore {...props} variant="solo" />;
}
