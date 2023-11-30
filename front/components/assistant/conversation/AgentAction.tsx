import { isDustAppRunActionType } from "@dust-tt/types";
import { isRetrievalActionType } from "@dust-tt/types";
import { AgentActionType } from "@dust-tt/types";

import DustAppRunAction from "./DustAppRunAction";
import RetrievalAction from "./RetrievalAction";

export function AgentAction({ action }: { action: AgentActionType }) {
  if (isRetrievalActionType(action)) {
    return (
      <div className="pb-4">
        <RetrievalAction retrievalAction={action} />
      </div>
    );
  }
  if (isDustAppRunActionType(action)) {
    return (
      <div className="pb-4">
        <DustAppRunAction dustAppRunAction={action} />
      </div>
    );
  }
  throw new Error(`Unhandled action ${action}`);
}
