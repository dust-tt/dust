import { Chip, ToolCard } from "@dust-tt/sparkle";
import assert from "assert";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { getIcon } from "@app/lib/actions/mcp_icons";
import type { InternalMCPServerFlavorType } from "@app/lib/api/mcp";

interface FlavorSectionProps {
  flavors: InternalMCPServerFlavorType[];
}

export function FlavorSection({ flavors }: FlavorSectionProps) {
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.additionalConfiguration.flavors"
  >({
    name: "configuration.additionalConfiguration.flavors",
  });

  const fieldValue = field.value;
  assert(
    Array.isArray(fieldValue) || fieldValue === undefined,
    "FlavorSection - field.value must be an array or null"
  );

  return (
    flavors.length > 0 && (
      <>
        <ConfigurationSectionContainer
          title="Select Flavors"
          error={fieldState.error?.message}
        >
          <div className="grid grid-cols-2 gap-3">
            {flavors.map((f, idx) => (
              <ToolCard
                key={idx}
                icon={getIcon(f.icon)}
                label={f.name}
                description={f.description}
                isSelected={fieldValue?.includes(f.name)}
                canAdd={true}
                onClick={() => {
                  const currentValue = fieldValue || [];
                  field.onChange([...currentValue, f.name]);
                }}
              />
            ))}
          </div>
        </ConfigurationSectionContainer>

        <FlavorSectionFooter
          selectedFlavor={fieldValue || []}
          onRemoveSelectedFlavor={(flavorToRemove) => {
            field.onChange(fieldValue?.filter((f) => f !== flavorToRemove));
          }}
        />
      </>
    )
  );
}

interface FlavorSectionFooterProps {
  onRemoveSelectedFlavor?: (flavor: unknown) => void;
  selectedFlavor: string[];
}

export function FlavorSectionFooter({
  onRemoveSelectedFlavor,
  selectedFlavor,
}: FlavorSectionFooterProps) {
  return (
    <>
      {selectedFlavor.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 space-y-3 border-t border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Selected flavors</h2>
          <div className="flex flex-wrap gap-2">
            {selectedFlavor.map((flavor, idx) => (
              <Chip
                key={idx}
                label={flavor}
                onRemove={
                  onRemoveSelectedFlavor
                    ? () => onRemoveSelectedFlavor(flavor)
                    : undefined
                }
                size="xs"
                color="green"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
