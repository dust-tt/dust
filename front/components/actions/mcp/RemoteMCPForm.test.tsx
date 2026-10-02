import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import type { RemoteMCPServerType } from "@app/lib/api/mcp";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dust-tt/sparkle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dust-tt/sparkle")>();
  return {
    ...actual,
    ContentMessage: ({
      variant,
      title,
      children,
    }: {
      variant?: string;
      title?: string;
      children?: React.ReactNode;
    }) => (
      <div data-variant={variant} data-title={title}>
        {title}
        {children}
      </div>
    ),
  };
});

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useSyncRemoteMCPServer: () => ({ syncServer: vi.fn() }),
}));

vi.mock("@app/components/actions/mcp/MCPServerHeaders", () => ({
  MCPServerHeaders: () => null,
}));

vi.mock("@app/components/actions/mcp/MCPServerMetaFields", () => ({
  MCPServerMetaFields: () => null,
}));

const owner = LightWorkspaceFactory.build();

const mcpServer: RemoteMCPServerType = {
  sId: "rms_test",
  name: "test-remote",
  version: "1.0.0",
  description: "Remote MCP",
  icon: "ToolsIcon",
  authorization: null,
  availability: "manual",
  allowMultipleInstances: true,
  documentationUrl: null,
  tools: [],
  url: "https://mcp.example.com",
  lastError: "401 Unauthorized",
  lastSyncAt: new Date("2026-01-01T12:00:00Z"),
};

function TestWrapper() {
  const form = useForm<MCPServerFormValues>({
    defaultValues: {
      icon: "ToolsIcon",
      customHeaders: [],
      metaFields: [],
      sharedSecret: "",
    } as MCPServerFormValues,
  });

  return (
    <FormProvider {...form}>
      <RemoteMCPForm owner={owner} mcpServer={mcpServer} />
    </FormProvider>
  );
}

describe("RemoteMCPForm sync banner", () => {
  it("shows synchronization warning with info variant, not synchronization error", () => {
    render(<TestWrapper />);

    const banner = document.querySelector(
      '[data-title="Synchronization warning"]'
    );
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute("data-variant", "info");
    expect(screen.queryByText("Synchronization Error")).not.toBeInTheDocument();
  });
});
