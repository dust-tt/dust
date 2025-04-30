import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { makeColumnsForApps } from "@app/components/poke/apps/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { usePokeApps } from "@app/poke/swr/apps";
import { usePokeSpaces } from "@app/poke/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface AppDataTableProps {
  owner: LightWorkspaceType;
}

export function ImportAppModal({
  show,
  onClose,
  owner,
}: {
  show: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}) {
  const [importing, setImporting] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<SpaceType | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const importApp = async (
    owner: LightWorkspaceType,
    router: NextRouter,
    setImporting: (importing: boolean) => void
  ) => {
    if (selectedFile) {
      setImporting(true);
      const fileContent = await selectedFile.text();
      const response = await fetch(
        `/api/poke/workspaces/${owner.sId}/apps/import?spaceId=${selectedSpace?.sId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: fileContent,
        }
      );
      setImporting(false);
      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        window.alert(`Failed to import app. ${errorData.message}`);
      } else {
        router.reload();
      }
    }
  };

  const { data: spaces } = usePokeSpaces({ owner });
  useEffect(() => {
    if (spaces.length > 0) {
      setSelectedSpace(spaces[0]);
    }
  }, [spaces]);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Import an app</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-4">
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setSelectedFile(file);
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <Label>Target Space </Label>
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" label={selectedSpace?.name} />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {spaces.map((space) => (
                    <DropdownMenuItem
                      key={space.sId}
                      onClick={() => setSelectedSpace(space)}
                    >
                      {space.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>File to import </Label>
            <div>
              <Button
                variant="outline"
                label={selectedFile?.name ?? "Select"}
                onClick={() => fileInputRef.current?.click()}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <Button
                variant="outline"
                label={importing ? "📥 Importing..." : "📥 Import app"}
                isLoading={importing}
                onClick={() => importApp(owner, router, setImporting)}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppDataTable({ owner }: AppDataTableProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);

  const appButtons = (
    <div className="flex flex-row gap-2">
      <Button
        aria-label="Import a Dust App"
        variant="outline"
        size="sm"
        onClick={() => setIsImportOpen(true)}
        label={"📥 Import App"}
      />
    </div>
  );
  return (
    <>
      <ImportAppModal
        show={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        owner={owner}
      />
      <PokeDataTableConditionalFetch
        header="Apps"
        globalActions={appButtons}
        owner={owner}
        useSWRHook={usePokeApps}
      >
        {(data) => (
          <PokeDataTable columns={makeColumnsForApps(owner)} data={data} />
        )}
      </PokeDataTableConditionalFetch>
    </>
  );
}
