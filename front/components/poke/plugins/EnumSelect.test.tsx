import { EnumSelect } from "@app/components/poke/plugins/EnumSelect";
import {
  PokeForm,
  PokeFormField,
  PokeFormItem,
} from "@app/components/poke/shadcn/ui/form";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
Element.prototype.scrollIntoView = vi.fn();

const OPTIONS = [
  {
    label: "[On demand] models_picker",
    value: "models_picker",
  },
  {
    label: "[Dust only] xai_feature",
    value: "xai_feature",
  },
] as const;

function TestEnumSelect() {
  const form = useForm({
    defaultValues: { features: [] as string[] },
  });

  return (
    <PokeForm {...form}>
      <PokeFormField
        control={form.control}
        name="features"
        render={({ field }) => (
          <PokeFormItem>
            <EnumSelect
              label="Feature Flags"
              multiple
              onValuesChange={field.onChange}
              options={OPTIONS}
              values={field.value}
            />
          </PokeFormItem>
        )}
      />
    </PokeForm>
  );
}

describe("EnumSelect", () => {
  it("filters feature flags using space-separated terms", async () => {
    const user = userEvent.setup();
    render(<TestEnumSelect />);

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText("Feature Flags"),
      "models picker"
    );

    expect(screen.getByText("[On demand] models_picker")).toBeVisible();
    expect(
      screen.queryByText("[Dust only] xai_feature")
    ).not.toBeInTheDocument();
  });
});
