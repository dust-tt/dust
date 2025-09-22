import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  getInfoFormDefaults,
  getInfoFormSchema,
} from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  getSuccessTitle,
  submitMCPServerDetailsForm,
} from "@app/components/actions/mcp/forms/submitMCPServerDetailsForm";
import { MCPServerDetailsSheet } from "@app/components/actions/mcp/MCPServerDetailsSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServers, useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";

interface MCPServerDetailsProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
}

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isAdmin(owner),
  });
  const systemSpace = useMemo(
    () => spaces.find((s) => s.kind === "system"),
    [spaces]
  );
  const { mutateMCPServerViews } = useMCPServerViews({
    owner,
    space: systemSpace,
    disabled: true,
  });
  const { mutateMCPServers } = useMCPServers({ owner, disabled: true });
  const sendNotification = useSendNotification(true);

  const defaults = useMemo<InfoFormValues>(() => {
    if (mcpServerView) {
      return getInfoFormDefaults(mcpServerView);
    }
    return { name: "", description: "" };
  }, [mcpServerView]);

  const form = useForm<InfoFormValues>({
    values: defaults,
    mode: "onChange",
    shouldUnregister: true,
    resolver: mcpServerView
      ? zodResolver(getInfoFormSchema(mcpServerView))
      : undefined,
  });

  const onSave = () => {
    void form.handleSubmit(async (values) => {
      if (!mcpServerView) {
        return;
      }

      const mutateCaches = async () => {
        await mutateMCPServerViews();
        await mutateMCPServers();
      };

      const result = await submitMCPServerDetailsForm({
        owner,
        mcpServerView,
        initialValues: defaults,
        values,
        mutate: mutateCaches,
      });

      if (result.isOk()) {
        sendNotification({
          type: "success",
          title: getSuccessTitle(mcpServerView),
          description: "Your changes have been saved.",
        });
        form.reset(values);
      } else {
        sendNotification({
          type: "error",
          title: "Save failed",
          description: result.error.message,
        });
      }
    })();
  };

  const onCancel = () => {
    form.reset(defaults);
  };

  return (
    <FormProvider form={form}>
      <MCPServerDetailsSheet
        owner={owner}
        mcpServerView={mcpServerView}
        isOpen={isOpen}
        onClose={onClose}
        onSave={onSave}
        onCancel={onCancel}
      />
    </FormProvider>
  );
}
