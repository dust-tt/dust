import type { DustSystemOneEndpointConstructor } from "@app/lib/llms/system_one/dust_system_one_endpoint";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import { matchesWhere } from "@app/lib/llms/utils/matches_where";

// Same two-sided match as stream and batch endpoints: the caller's condition on
// the endpoint, and the endpoint's own condition on the workspace.
export function isEndpointAvailable(
  endpointConstructor: DustSystemOneEndpointConstructor,
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return (
    matchesWhere(endpointConstructor, inputCondition) &&
    matchesWhere(workspaceConfiguration, endpointConstructor.endpointFilter)
  );
}
