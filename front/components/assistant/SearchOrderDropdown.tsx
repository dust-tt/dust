import {
  Button,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuTrigger,
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
    <NewDropdownMenu>
      <NewDropdownMenuTrigger asChild>
        <Button
          isSelect
          label={`Order by: ${prettyfiedSearchOrder[orderBy]}`}
          variant="ghost"
          size="sm"
          disabled={disabled}
        />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        {SearchOrder.map((order) => (
          <NewDropdownMenuItem
            key={order}
            label={prettyfiedSearchOrder[order]}
            onClick={() => setOrderBy(order)}
          />
        ))}
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
