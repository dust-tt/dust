import type { RequestUserDataActionType } from "@dust-tt/types";

import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function RequestUserDataActionDetails(
  props: ActionDetailsComponentBaseProps<RequestUserDataActionType>
) {
  console.log("RequestUserDataActionDetails", props);
  return <div>RequestUserData Action details</div>;
}
