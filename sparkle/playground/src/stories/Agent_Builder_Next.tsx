import "@dust-tt/sparkle/styles/allotment.css";

import { AgentBuilderNextView } from "../components/AgentBuilderNextView";

// Working copy of the agent builder. `AgentBuilderView` is shared by the
// Inbox, Pods, People_Agent and New_Navigation playgrounds, so design
// iterations happen here on a forked view that nothing else depends on.
export default function AgentBuilderNext() {
  return <AgentBuilderNextView />;
}
