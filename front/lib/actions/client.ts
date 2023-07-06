import {
  DustAppConfigType,
  processStreamedRunResponse,
} from "@app/lib/dust_api";
import { WorkspaceType } from "@app/types/user";

/**
 * This function is intended to be used by the client directly. It proxies through the local
 * `front` instance to execute an action while injecting the system API key of the owner. This is
 * required as we can't push the system API key to the client to talk direclty to Dust production.
 *
 * See /front/pages/api/w/[wId]/use/actions/[action]/index.ts
 *
 * @param owner WorkspaceType the owner workspace running the action
 * @param action string the action name
 * @param config DustAppConfigType the action config
 * @param inputs any[] the action inputs
 */
export async function runActionStreamed(
  owner: WorkspaceType,
  action: string,
  config: DustAppConfigType,
  inputs: any[]
) {
  const res = await fetch(`/api/w/${owner.sId}/use/actions/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config: config,
      inputs: inputs,
    }),
  });

  return processStreamedRunResponse(res);
}
