import {
  ConversationThreadCore,
  type ConversationThreadCoreProps,
} from "./ConversationThreadCore";

export type ConversationViewProps = Omit<
  ConversationThreadCoreProps,
  "variant"
>;

export function ConversationView(props: ConversationViewProps) {
  return <ConversationThreadCore {...props} variant="default" />;
}
