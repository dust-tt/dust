import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

export const SearchOrder = ["name", "usage", "edited_at"] as const;
export type SearchOrderType = (typeof SearchOrder)[number];

const prettyfiedSearchOrder: { [key in SearchOrderType]: string } = {
  name: "Name",
  usage: "Usage",
  edited_at: "Last edited at",
};

interface SearchOrderDropdownProps {
  orderBy: SearchOrderType;
  setOrderBy: (orderBy: SearchOrderType) => void;
  disabled?: boolean;
}

export function SearchOrderDropdown({
  orderBy,
  setOrderBy,
  disabled,
}: SearchOrderDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          isSelect
          label={`Order by: ${prettyfiedSearchOrder[orderBy]}`}
          variant="ghost"
          size="sm"
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {SearchOrder.map((order) => (
          <DropdownMenuItem
            key={order}
            label={prettyfiedSearchOrder[order]}
            onClick={() => setOrderBy(order)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
