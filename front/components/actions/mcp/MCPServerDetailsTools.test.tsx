import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  encodeMCPToolNameForForm,
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  MCPServerDetailsTools,
  MCPServerDetailsToolsBulkBar,
  useToolsAndStakesController,
} from "@app/components/actions/mcp/MCPServerDetailsTools";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

interface ButtonStubProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label?: string;
  isSelect?: boolean;
  icon?: unknown;
  size?: string;
  variant?: string;
}

interface CheckboxStubProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange"> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
}

interface ChildrenStubProps {
  children: ReactNode;
}

interface DropdownMenuContentStubProps extends ChildrenStubProps {
  align?: string;
  side?: string;
}

interface DropdownMenuItemStubProps {
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: unknown;
}

interface DropdownMenuLabelStubProps {
  label: string;
}

interface HoverableStubProps extends ChildrenStubProps {
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

interface LabelStubProps extends LabelHTMLAttributes<HTMLLabelElement> {
  isMuted?: boolean;
}

interface ListItemStubProps extends HTMLAttributes<HTMLLIElement> {
  children: ReactNode;
}

interface SearchInputStubProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  name: string;
  className?: string;
}

interface SliderToggleStubProps {
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

vi.mock("@dust-tt/sparkle", () => ({
  Button: ({
    label,
    isSelect: _isSelect,
    icon: _icon,
    size: _size,
    variant: _variant,
    ...rest
  }: ButtonStubProps) => (
    <button type="button" {...rest}>
      {label}
    </button>
  ),
  Check: () => null,
  Checkbox: ({ checked, onCheckedChange, ...rest }: CheckboxStubProps) => (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...rest}
    />
  ),
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  ContentMessage: ({ children }: ChildrenStubProps) => <div>{children}</div>,
  DropdownMenu: ({ children }: ChildrenStubProps) => <div>{children}</div>,
  DropdownMenuContent: ({
    children,
    align: _align,
    side: _side,
  }: DropdownMenuContentStubProps) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    label,
    onClick,
    icon: _icon,
  }: DropdownMenuItemStubProps) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  DropdownMenuLabel: ({ label }: DropdownMenuLabelStubProps) => (
    <div>{label}</div>
  ),
  DropdownMenuTrigger: ({ children }: ChildrenStubProps) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  Hoverable: ({ children, onClick }: HoverableStubProps) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  InfoCircle: () => null,
  Label: ({ children, isMuted: _isMuted, ...rest }: LabelStubProps) => (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label {...rest}>{children}</label>
  ),
  ListGroup: ({ children }: ChildrenStubProps) => <ul>{children}</ul>,
  ListItem: ({ children, ...rest }: ListItemStubProps) => (
    <li {...rest} data-testid="tool-row">
      {children}
    </li>
  ),
  SearchInput: ({
    value,
    onChange,
    placeholder,
    name,
    className,
  }: SearchInputStubProps) => (
    <input
      aria-label={name}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  ),
  SliderToggle: ({ selected, onClick }: SliderToggleStubProps) => (
    <button
      type="button"
      data-testid="enable-toggle"
      data-selected={String(!!selected)}
      onClick={onClick}
    />
  ),
  Spinner: () => null,
  XClose: () => null,
}));

// Treat the test server as remote so default-stake lookups skip the internal
// server registry, and so no tool qualifies for the medium stake.
vi.mock("@app/lib/actions/mcp_helper", () => ({
  isRemoteMCPServerType: () => true,
  requiresBearerTokenConfiguration: () => false,
  getMcpServerViewDescription: (view: { description?: string }) =>
    view.description ?? "test description",
}));

const WEATHER_TOOL = "weather.get_current";
const CALENDAR_TOOL = "calendar_sync";

const twoToolView = MCPServerViewTypeFactory.build({
  server: {
    tools: [
      { name: WEATHER_TOOL, description: "Get current weather" },
      { name: CALENDAR_TOOL, description: "Sync calendar" },
    ],
  },
  toolsMetadata: [
    { toolName: WEATHER_TOOL, enabled: true, permission: "low" },
    { toolName: CALENDAR_TOOL, enabled: true, permission: "low" },
  ],
});

function renderTools(view = twoToolView) {
  let form!: UseFormReturn<MCPServerFormValues>;

  function Harness() {
    const currentForm = useForm<MCPServerFormValues>({
      values: getMCPServerFormDefaults(view),
      mode: "onChange",
      shouldUnregister: false,
      resolver: zodResolver(
        getMCPServerFormSchema(view, { existingViewNames: [] })
      ),
    });
    form = currentForm;

    return (
      <FormProvider {...currentForm}>
        <Body />
      </FormProvider>
    );
  }

  function Body() {
    const controller = useToolsAndStakesController(view);
    return (
      <>
        <MCPServerDetailsTools mcpServerView={view} controller={controller} />
        <div data-testid="bulk-bar">
          <MCPServerDetailsToolsBulkBar controller={controller} />
        </div>
      </>
    );
  }

  render(<Harness />);

  const settingsFor = (toolName: string) =>
    form.getValues().toolSettings[encodeMCPToolNameForForm(toolName)];

  return {
    get form() {
      return form;
    },
    settingsFor,
  };
}

const getSearchInput = () => screen.getByLabelText("tool-filter");
const getRows = () => screen.getAllByTestId("tool-row");
const getBulkBar = () => screen.getByTestId("bulk-bar");

/** The row's stake dropdown button, as opposed to the items it opens. */
const getStakeTrigger = (row: HTMLElement) =>
  within(within(row).getByTestId("dropdown-trigger")).getByRole("button");

const getBulkStakeMenu = () =>
  within(getBulkBar()).getAllByTestId("dropdown-content")[0];
const getBulkStateMenu = () =>
  within(getBulkBar()).getAllByTestId("dropdown-content")[1];

function selectRow(index: number) {
  const checkbox = within(getRows()[index]).getByRole("checkbox");
  fireEvent.click(checkbox);
}

describe("MCPServerDetailsTools", () => {
  it("filters the list by tool name and description", () => {
    renderTools();
    expect(getRows()).toHaveLength(2);

    fireEvent.change(getSearchInput(), { target: { value: "weather" } });
    expect(getRows()).toHaveLength(1);
    expect(screen.getByText(asDisplayName(WEATHER_TOOL))).toBeInTheDocument();

    // The description answers the search too, not just the name.
    fireEvent.change(getSearchInput(), { target: { value: "sync calendar" } });
    expect(getRows()).toHaveLength(1);
    expect(screen.getByText(asDisplayName(CALENDAR_TOOL))).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "nothing" } });
    expect(screen.queryAllByTestId("tool-row")).toHaveLength(0);
    expect(
      screen.getByText("No tool matches that search.")
    ).toBeInTheDocument();
  });

  it("scopes 'Select all' to what the search left", () => {
    renderTools();

    fireEvent.change(getSearchInput(), { target: { value: "weather" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    // Only the visible tool is picked up, not the one the search hid.
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deselect all" })
    ).toBeInTheDocument();
  });

  it("applies a batch stake to the selection only", async () => {
    const { settingsFor } = renderTools();

    selectRow(0);
    await act(async () => {
      fireEvent.click(
        within(getBulkStakeMenu()).getByRole("button", {
          name: "High (always ask for confirmation)",
        })
      );
    });

    expect(settingsFor(WEATHER_TOOL).permission).toBe("high");
    expect(settingsFor(CALENDAR_TOOL).permission).toBe("low");
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
  });

  it("applies a batch state change to the selection only", async () => {
    const { settingsFor } = renderTools();

    selectRow(1);
    await act(async () => {
      fireEvent.click(
        within(getBulkStateMenu()).getByRole("button", {
          name: "Disable",
        })
      );
    });

    expect(settingsFor(CALENDAR_TOOL).enabled).toBe(false);
    expect(settingsFor(WEATHER_TOOL).enabled).toBe(true);
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();
    expect(within(getRows()[1]).getByRole("checkbox")).toBeChecked();
  });

  it("keeps selected tools across search changes", () => {
    renderTools();

    selectRow(0);
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
  });

  it("selects and deselects visible tools without changing hidden selections", () => {
    renderTools();

    selectRow(0);
    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(within(getBulkBar()).getByText("2 selected.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(within(getBulkBar()).getByText("1 selected.")).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
    expect(within(getRows()[1]).getByRole("checkbox")).not.toBeChecked();
  });

  it("applies batch changes to selected tools hidden by search", async () => {
    const { settingsFor } = renderTools();

    selectRow(0);
    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    selectRow(0);

    await act(async () => {
      fireEvent.click(
        within(getBulkStateMenu()).getByRole("button", {
          name: "Disable",
        })
      );
    });

    expect(settingsFor(WEATHER_TOOL).enabled).toBe(false);
    expect(settingsFor(CALENDAR_TOOL).enabled).toBe(false);
    expect(within(getBulkBar()).getByText("2 selected.")).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
    expect(within(getRows()[1]).getByRole("checkbox")).toBeChecked();
  });

  it("keeps dotted tool names flat in form state and still validates", async () => {
    const { form, settingsFor } = renderTools();

    await act(async () => {
      fireEvent.click(within(getRows()[0]).getByTestId("enable-toggle"));
    });

    // Dots in a tool name must not be read as nested-field separators.
    expect(settingsFor(WEATHER_TOOL).enabled).toBe(false);
    expect(form.getValues().toolSettings["weather"]).toBeUndefined();
    expect(form.getValues().toolSettings[WEATHER_TOOL]).toBeUndefined();

    let isValid = false;
    await act(async () => {
      isValid = await form.trigger();
    });
    expect(isValid).toBe(true);
    expect(form.formState.errors.toolSettings).toBeUndefined();
  });

  it("omits medium from the batch stakes when no selected tool supports it", () => {
    renderTools();

    selectRow(0);

    const stakeMenu = getBulkStakeMenu();
    expect(
      within(stakeMenu).getByRole("button", {
        name: "High (always ask for confirmation)",
      })
    ).toBeInTheDocument();
    expect(
      within(stakeMenu).queryByRole("button", {
        name: "Medium (allows input-scoped confirmation save)",
      })
    ).toBeNull();
  });

  it("recedes the row and drops the stake line for a tool that is switched off", async () => {
    renderTools();

    const row = getRows()[0];
    expect(getStakeTrigger(row)).toBeInTheDocument();
    expect(row).not.toHaveClass("bg-app-background");
    expect(within(row).getByText(asDisplayName(WEATHER_TOOL))).not.toHaveClass(
      "text-muted-foreground"
    );

    await act(async () => {
      fireEvent.click(within(row).getByTestId("enable-toggle"));
    });

    const disabledRow = getRows()[0];
    expect(within(disabledRow).queryByText("Stake")).toBeNull();
    expect(within(disabledRow).queryByTestId("dropdown-trigger")).toBeNull();
    expect(disabledRow).toHaveClass("bg-app-background");
    expect(
      within(disabledRow).getByText(asDisplayName(WEATHER_TOOL))
    ).toHaveClass("text-muted-foreground");
  });
});
