import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import { diffInfoForm } from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  getMcpServerViewDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

export async function submitMCPServerDetailsForm({
  owner,
  mcpServerView,
  initialValues,
  values,
  mutate,
}: {
  owner: WorkspaceType;
  mcpServerView: MCPServerViewType;
  initialValues: InfoFormValues;
  values: InfoFormValues;
  mutate?: () => Promise<void>;
}): Promise<Result<void, Error>> {
  const isRemote = isRemoteMCPServerType(mcpServerView.server);
  const diff = diffInfoForm(initialValues, values, isRemote);

  try {
    if (diff.serverView) {
      const res = await fetch(
        `/api/w/${owner.sId}/mcp/views/${mcpServerView.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(diff.serverView),
        }
      );
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error?.message || "Failed to update view");
      }
    }

    if (diff.remoteIcon) {
      const res = await fetch(
        `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon: diff.remoteIcon }),
        }
      );
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error?.message || "Failed to update icon");
      }
    }

    if (diff.remoteSharedSecret) {
      const res = await fetch(
        `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharedSecret: diff.remoteSharedSecret }),
        }
      );
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error?.message || "Failed to update shared secret");
      }
    }

    if (mutate) {
      await mutate();
    }

    return new Ok<void>(undefined);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return new Err(err);
  }
}

export function getSuccessTitle(mcpServerView: MCPServerViewType) {
  return `${getMcpServerViewDisplayName(mcpServerView)} updated`;
}
