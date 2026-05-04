import {
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
  type MCPServerFormValues,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

// Stub Sparkle UI primitives so they render plain DOM and let us click the checkbox.
vi.mock("@dust-tt/sparkle", () => ({
  Button: ({ label, isSelect: _isSelect, ...rest }: any) => (
    <button {...rest}>{label}</button>
  ),
  Card: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  Checkbox: ({ checked, onClick }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onClick={onClick}
      onChange={() => {}}
    />
  ),
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => (
    <button type="button">{children}</button>
  ),
  ContentMessage: ({ children }: any) => <div>{children}</div>,
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ label }: any) => <button type="button">{label}</button>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  InformationCircleIcon: () => null,
}));

// Treat the test server as remote so default-stake lookups skip the internal
// server registry.
vi.mock("@app/lib/actions/mcp_helper", () => ({
  isRemoteMCPServerType: () => true,
  requiresBearerTokenConfiguration: () => false,
  getMcpServerViewDescription: (view: { description?: string }) =>
    view.description ?? "test description",
}));

const TOOL_NAME_WITH_DOT = "weather.get_current";
const TOOL_NAME_WITH_UNDERSCORE = "get_messages";

const owner = LightWorkspaceFactory.build();

const mcpServerView = {
  id: 1,
  sId: "msv_1",
  name: "Test Server",
  description: "Test server description",
  spaceId: "sp_1",
  serverType: "remote",
  oAuthUseCase: null,
  editedByUser: null,
  createdAt: 0,
  updatedAt: 0,
  toolsMetadata: undefined,
  server: {
    sId: "rms_1",
    name: "test-server",
    version: "1.0.0",
    description: "Test server description",
    icon: "ToolsIcon",
    authorization: null,
    availability: "manual",
    allowMultipleInstances: true,
    documentationUrl: null,
    tools: [
      {
        name: TOOL_NAME_WITH_DOT,
        description: "Get current weather",
      },
    ],
  },
} satisfies MCPServerViewType;

const readOnlyMcpServerView = {
  ...mcpServerView,
  server: {
    ...mcpServerView.server,
    tools: [
      {
        name: TOOL_NAME_WITH_UNDERSCORE,
        description: "Get messages",
      },
    ],
  },
} satisfies MCPServerViewType;

function renderToolsList() {
  let form!: UseFormReturn<MCPServerFormValues>;

  function Harness() {
    const defaults = getMCPServerFormDefaults(mcpServerView);
    const currentForm = useForm<MCPServerFormValues>({
      values: defaults,
      mode: "onChange",
      shouldUnregister: false,
      resolver: zodResolver(
        getMCPServerFormSchema(mcpServerView, { existingViewNames: [] })
      ),
    });

    form = currentForm;

    return (
      <FormProvider {...currentForm}>
        <ToolsList owner={owner} mcpServerView={mcpServerView} />
      </FormProvider>
    );
  }

  render(<Harness />);

  return { form };
}

describe("ToolsList", () => {
  it("keeps form state flat and validates when a tool name contains a dot", async () => {
    const { form } = renderToolsList();

    // Toggling the dotted-name tool's enabled state used to corrupt RHF state
    // because dots in field paths are interpreted as nested-object separators.
    const checkbox = screen.getByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    const values = form.getValues();

    // The dotted key must remain a flat record entry, not a nested path.
    expect(values.toolSettings[TOOL_NAME_WITH_DOT]).toBeDefined();
    expect(values.toolSettings[TOOL_NAME_WITH_DOT].enabled).toBe(false);
    // No nested object should have been created at the path "weather.get_current".
    expect(values.toolSettings["weather"]).toBeUndefined();

    // Schema validation must pass — this is the user-facing failure mode.
    const isValid = await form.trigger();
    expect(isValid).toBe(true);
    expect(form.formState.errors.toolSettings).toBeUndefined();
  });

  it("renders in read-only mode without relying on the MCP settings form context", () => {
    render(
      <ToolsList
        owner={owner}
        mcpServerView={readOnlyMcpServerView}
        disableUpdates
      />
    );

    expect(screen.getByText(/available tools/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /get messages/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
