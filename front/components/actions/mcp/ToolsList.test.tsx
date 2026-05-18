import {
  encodeMCPToolNameForForm,
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
  type MCPServerFormValues,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
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
const SECOND_TOOL_NAME = "calendar.sync";
const TOOL_NAME_WITH_UNDERSCORE = "get_messages";

const owner = LightWorkspaceFactory.build();

const mcpServerView = MCPServerViewTypeFactory.build({
  server: {
    tools: [
      {
        name: TOOL_NAME_WITH_DOT,
        description: "Get current weather",
      },
    ],
  },
});

const mcpServerViewWithTwoTools = MCPServerViewTypeFactory.build({
  server: {
    tools: [
      {
        name: TOOL_NAME_WITH_DOT,
        description: "Get current weather",
      },
      {
        name: SECOND_TOOL_NAME,
        description: "Sync calendar",
      },
    ],
  },
  toolsMetadata: [
    {
      toolName: TOOL_NAME_WITH_DOT,
      enabled: true,
      permission: "low",
    },
    {
      toolName: SECOND_TOOL_NAME,
      enabled: true,
      permission: "low",
    },
  ],
});

const updatedMcpServerViewWithTwoTools = MCPServerViewTypeFactory.build({
  ...mcpServerViewWithTwoTools,
  toolsMetadata: [
    {
      toolName: TOOL_NAME_WITH_DOT,
      enabled: true,
      permission: "low",
    },
    {
      toolName: SECOND_TOOL_NAME,
      enabled: false,
      permission: "high",
    },
  ],
});

const readOnlyMcpServerView = MCPServerViewTypeFactory.build({
  server: {
    tools: [
      {
        name: TOOL_NAME_WITH_UNDERSCORE,
        description: "Get messages",
      },
    ],
  },
});

function renderToolsList({
  view = mcpServerView,
  keepDirtyValues = false,
}: {
  view?: typeof mcpServerView;
  keepDirtyValues?: boolean;
} = {}) {
  let form!: UseFormReturn<MCPServerFormValues>;

  function Harness({ currentView }: { currentView: typeof mcpServerView }) {
    const defaults = getMCPServerFormDefaults(currentView);
    const currentForm = useForm<MCPServerFormValues>({
      values: defaults,
      mode: "onChange",
      shouldUnregister: false,
      resetOptions: {
        keepDirtyValues,
      },
      resolver: zodResolver(
        getMCPServerFormSchema(currentView, { existingViewNames: [] })
      ),
    });

    form = currentForm;

    return (
      <FormProvider {...currentForm}>
        <ToolsList owner={owner} mcpServerView={currentView} />
      </FormProvider>
    );
  }

  const rendered = render(<Harness currentView={view} />);

  return {
    form,
    rerender: (currentView: typeof mcpServerView) =>
      rendered.rerender(<Harness currentView={currentView} />),
  };
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
    const encodedToolName = encodeMCPToolNameForForm(TOOL_NAME_WITH_DOT);

    expect(values.toolSettings[encodedToolName]).toBeDefined();
    expect(values.toolSettings[encodedToolName].enabled).toBe(false);
    // No nested object should have been created at the path "weather.get_current".
    expect(values.toolSettings["weather"]).toBeUndefined();
    expect(values.toolSettings[TOOL_NAME_WITH_DOT]).toBeUndefined();

    // Schema validation must pass — this is the user-facing failure mode.
    let isValid = false;
    await act(async () => {
      isValid = await form.trigger();
    });
    expect(isValid).toBe(true);
    expect(form.formState.errors.toolSettings).toBeUndefined();
  });

  it("preserves only the edited tool on form resets", async () => {
    const { form, rerender } = renderToolsList({
      view: mcpServerViewWithTwoTools,
      keepDirtyValues: true,
    });

    const [firstCheckbox] = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(firstCheckbox);
    });

    await act(async () => {
      rerender(updatedMcpServerViewWithTwoTools);
    });

    const values = form.getValues();
    expect(
      values.toolSettings[encodeMCPToolNameForForm(TOOL_NAME_WITH_DOT)].enabled
    ).toBe(false);
    expect(
      values.toolSettings[encodeMCPToolNameForForm(SECOND_TOOL_NAME)].enabled
    ).toBe(false);
    expect(
      values.toolSettings[encodeMCPToolNameForForm(SECOND_TOOL_NAME)].permission
    ).toBe("high");
  });

  it("does not throw when rendered outside an MCPServerFormValues FormProvider", () => {
    // Regression: the agent builder mounts <ToolsList disableUpdates /> with
    // no surrounding FormProvider for MCPServerFormValues. An earlier version
    // called useFormContext / useController unconditionally and crashed in
    // that context.
    expect(() =>
      render(
        <ToolsList
          owner={owner}
          mcpServerView={readOnlyMcpServerView}
          disableUpdates
        />
      )
    ).not.toThrow();

    expect(
      screen.getByRole("heading", { name: /get messages/i })
    ).toBeInTheDocument();
  });
});
