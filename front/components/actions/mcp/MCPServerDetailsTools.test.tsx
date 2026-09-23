import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  encodeMCPToolNameForForm,
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  MCPServerDetailsTools,
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
import { useState } from "react";
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

interface ChipStubProps {
  className?: string;
  label?: string;
  onRemove?: () => void;
  size?: string;
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

interface PopoverStubProps {
  content: ReactNode;
  popoverTriggerAsChild?: boolean;
  trigger: ReactNode;
}

interface ScrollAreaStubProps extends ChildrenStubProps {
  className?: string;
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
  Chip: ({ className, label, onRemove, size: _size }: ChipStubProps) => (
    <div className={className}>
      <span>{label}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
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
  Popover: ({
    content,
    popoverTriggerAsChild: _popoverTriggerAsChild,
    trigger,
  }: PopoverStubProps) => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <div onClick={() => setOpen((previous) => !previous)}>{trigger}</div>
        {open && <div data-testid="popover-content">{content}</div>}
      </>
    );
  },
  ScrollArea: ({ children, className }: ScrollAreaStubProps) => (
    <div className={className} data-testid="scroll-area">
      {children}
    </div>
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

const manyTools = Array.from({ length: 6 }, (_, index) => ({
  name: `tool_${index}`,
  description: `Tool ${index}`,
}));

const manyToolView = MCPServerViewTypeFactory.build({
  server: { tools: manyTools },
  toolsMetadata: manyTools.map((tool) => ({
    toolName: tool.name,
    enabled: true,
    permission: "low",
  })),
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
      <MCPServerDetailsTools mcpServerView={view} controller={controller} />
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
const getSelectionPopover = () => screen.getByTestId("popover-content");

/** The row's stake dropdown button, as opposed to the items it opens. */
const getStakeTrigger = (row: HTMLElement) =>
  within(within(row).getByTestId("dropdown-trigger")).getByRole("button");

const getSelectionStakeMenu = () =>
  within(getSelectionPopover()).getAllByTestId("dropdown-content")[0];
const getSelectionStateMenu = () =>
  within(getSelectionPopover()).getAllByTestId("dropdown-content")[1];

function openSelectionPopover(count: number) {
  fireEvent.click(screen.getByRole("button", { name: `${count} selected` }));
}

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
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deselect all" })
    ).toBeInTheDocument();
  });

  it("applies a batch stake to the selection only", async () => {
    const { settingsFor } = renderTools();

    selectRow(0);
    openSelectionPopover(1);
    await act(async () => {
      fireEvent.click(
        within(getSelectionStakeMenu()).getByRole("button", {
          name: "High (always ask for confirmation)",
        })
      );
    });

    expect(settingsFor(WEATHER_TOOL).permission).toBe("high");
    expect(settingsFor(CALENDAR_TOOL).permission).toBe("low");
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
  });

  it("applies a batch state change to the selection only", async () => {
    const { settingsFor } = renderTools();

    selectRow(1);
    openSelectionPopover(1);
    await act(async () => {
      fireEvent.click(
        within(getSelectionStateMenu()).getByRole("button", {
          name: "Disable",
        })
      );
    });

    expect(settingsFor(CALENDAR_TOOL).enabled).toBe(false);
    expect(settingsFor(WEATHER_TOOL).enabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();
    expect(within(getRows()[1]).getByRole("checkbox")).toBeChecked();
  });

  it("keeps selected tools across search changes", () => {
    renderTools();

    selectRow(0);
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
  });

  it("opens a stash where hidden selections can be removed", () => {
    renderTools();

    selectRow(0);
    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });

    expect(screen.queryByTestId("popover-content")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 selected" }));

    const stash = screen.getByTestId("popover-content");
    expect(
      within(stash).getByText(asDisplayName(WEATHER_TOOL))
    ).toBeInTheDocument();
    fireEvent.click(
      within(stash).getByRole("button", {
        name: `Remove ${asDisplayName(WEATHER_TOOL)}`,
      })
    );

    expect(screen.queryByRole("button", { name: "1 selected" })).toBeNull();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).not.toBeChecked();
  });

  it("clears every selection from the stash", () => {
    renderTools();

    selectRow(0);
    selectRow(1);
    fireEvent.click(screen.getByRole("button", { name: "2 selected" }));
    fireEvent.click(
      within(screen.getByTestId("popover-content")).getByRole("button", {
        name: "Clear all",
      })
    );

    expect(screen.queryByRole("button", { name: "2 selected" })).toBeNull();
    expect(within(getRows()[0]).getByRole("checkbox")).not.toBeChecked();
    expect(within(getRows()[1]).getByRole("checkbox")).not.toBeChecked();
  });

  it("bounds the stash when many tools are selected", () => {
    renderTools(manyToolView);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "6 selected" }));

    expect(screen.getByTestId("scroll-area")).toHaveClass("h-48");
  });

  it("selects and deselects visible tools without changing hidden selections", () => {
    renderTools();

    selectRow(0);
    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(
      screen.getByRole("button", { name: "2 selected" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(
      screen.getByRole("button", { name: "1 selected" })
    ).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "" } });
    expect(within(getRows()[0]).getByRole("checkbox")).toBeChecked();
    expect(within(getRows()[1]).getByRole("checkbox")).not.toBeChecked();
  });

  it("applies batch changes to selected tools hidden by search", async () => {
    const { settingsFor } = renderTools();

    selectRow(0);
    fireEvent.change(getSearchInput(), { target: { value: "calendar" } });
    selectRow(0);
    openSelectionPopover(2);

    await act(async () => {
      fireEvent.click(
        within(getSelectionStateMenu()).getByRole("button", {
          name: "Disable",
        })
      );
    });

    expect(settingsFor(WEATHER_TOOL).enabled).toBe(false);
    expect(settingsFor(CALENDAR_TOOL).enabled).toBe(false);
    expect(
      screen.getByRole("button", { name: "2 selected" })
    ).toBeInTheDocument();

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
    openSelectionPopover(1);

    const stakeMenu = getSelectionStakeMenu();
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
