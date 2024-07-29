import { Button, DropdownMenu } from "@dust-tt/sparkle";

export const SearchOrder = ["name", "usage", "edited_at"] as const;
export type SearchOrderType = (typeof SearchOrder)[number];

const prettyfiedSearchOrder: { [key in SearchOrderType]: string } = {
  name: "Name",
  usage: "Usage",
  edited_at: "Edited at",
};

// Headless UI does not inherently handle Portal-based rendering,
// leading to dropdown menus being hidden by parent divs with overflow settings.
// Adapts layout for smaller screens.
export function SearchOrderDropdown({
  orderBy,
  setOrderBy,
  disabled,
}: {
  orderBy: SearchOrderType;
  setOrderBy: (orderBy: SearchOrderType) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          type="select"
          labelVisible={true}
          label={`Order by: ${prettyfiedSearchOrder[orderBy]}`}
          variant="tertiary"
          hasMagnifying={false}
          size="sm"
          disabled={disabled}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topLeft">
        {SearchOrder.map((order) => (
          <DropdownMenu.Item
            key={order}
            label={prettyfiedSearchOrder[order]}
            onClick={() => setOrderBy(order)}
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
