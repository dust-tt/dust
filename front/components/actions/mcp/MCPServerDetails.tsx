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
import datadogLogger from "@app/logger/datadogLogger";
import type { WorkspaceType } from "@app/types";
import { isAdmin, sanitizeHeadersArray } from "@app/types";

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

  const onSave = async (): Promise<boolean> => {
    let success = false;
    await form.handleSubmit(
      async (values) => {
        if (!mcpServerView) {
          success = false;
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
          // Normalize values before resetting so the form is clean
          const normalizedValues: InfoFormValues = {
            ...values,
            // Ensure headers are sanitized so defaults match saved state
            customHeaders: sanitizeHeadersArray(values.customHeaders ?? []),
          };
          form.reset(normalizedValues);
          success = true;
        } else {
          sendNotification({
            type: "error",
            title: "Save failed",
            description: result.error.message,
          });
          datadogLogger.error(
            {
              errorMessage: result.error.message,
              serverViewId: mcpServerView.sId,
            },
            "[MCP Details] - Submit error"
          );
          success = false;
        }
      },
      async (errors) => {
        // Bubble up validation errors with clear context and focus
        const keys = Object.keys(errors);
        const firstErrorKey = keys[0] as keyof typeof errors | undefined;
        if (firstErrorKey) {
          form.setFocus(firstErrorKey as any);
        }
        const details =
          keys.length > 0 ? `Invalid: ${keys.join(", ")}` : undefined;
        datadogLogger.error(
          {
            fields: keys,
            serverViewId: mcpServerView?.sId,
          },
          "[MCP Details] - Form validation error"
        );
        sendNotification({
          type: "error",
          title: "Validation error",
          description:
            details ?? "Please fix the highlighted fields and try again.",
        });
        success = false;
      }
    )();
    return success;
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
