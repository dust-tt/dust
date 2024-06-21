import { Button, DropdownMenu } from "@dust-tt/sparkle";

export const SearchOrder = ["name", "usage", "magic"] as const;
export type SearchOrderType = (typeof SearchOrder)[number];

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
          label={`Order by: ${orderBy}`}
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
            label={order}
            onClick={() => setOrderBy(order)}
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
