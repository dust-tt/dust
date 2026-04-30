import {
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
  type MCPServerFormValues,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { LightWorkspaceType } from "@app/types/user";
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

const TOOL_NAME_WITH_DOT = "weather.get_current";

type ToolsListTestSetup = {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
};

async function setupToolsListTest(): Promise<ToolsListTestSetup> {
  const { workspace, globalSpace, authenticator } = await createResourceTest({
    role: "admin",
  });
  const server = await RemoteMCPServerFactory.create(workspace, {
    name: "test-server",
    description: "Test server description",
    tools: [
      {
        name: TOOL_NAME_WITH_DOT,
        description: "Get current weather",
      },
    ],
  });
  const serverView = await MCPServerViewFactory.create(
    workspace,
    server.sId,
    globalSpace
  );

  return {
    owner: authenticator.getNonNullableWorkspace(),
    mcpServerView: serverView.toJSON(),
  };
}

function renderToolsList({ owner, mcpServerView }: ToolsListTestSetup) {
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
    const setup = await setupToolsListTest();
    const { form } = renderToolsList(setup);

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

    // Schema validation must pass: this is the user-facing failure mode.
    let isValid = false;
    await act(async () => {
      isValid = await form.trigger();
    });
    expect(isValid).toBe(true);
    expect(form.formState.errors.toolSettings).toBeUndefined();
  });
});
