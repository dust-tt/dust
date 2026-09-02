import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameStorageLocation } from "@app/lib/api/poke/frames";
import { Button, LinkExternal01 } from "@dust-tt/sparkle";

interface FrameStorageTableProps {
  storage: PokeFrameStorageLocation[];
}

export function FrameStorageTable({ storage }: FrameStorageTableProps) {
  return (
    <div className="my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Storage</h2>
      <PokeTable>
        <PokeTableBody>
          {storage.map((location) => (
            <PokeTableRow key={location.label}>
              <PokeTableHead>{location.label}</PokeTableHead>
              <PokeTableCellWithCopy label={location.gcsUri} />
              <PokeTableCell>
                {location.consoleUrl ? (
                  <Button
                    label="Open in GCS"
                    variant="ghost"
                    size="xs"
                    icon={LinkExternal01}
                    href={location.consoleUrl}
                    target="_blank"
                  />
                ) : (
                  "—"
                )}
              </PokeTableCell>
            </PokeTableRow>
          ))}
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
