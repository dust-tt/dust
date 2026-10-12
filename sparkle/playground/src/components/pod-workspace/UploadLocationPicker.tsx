import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@dust-tt/sparkle";
import { useState } from "react";
import type { WorkspaceState } from "./engine";
import type { FileScope, WorkspaceLocation } from "./model";
import { UploadPreview } from "./UploadPreview";
import { WorkspaceFilesBrowser } from "./WorkspaceFilesBrowser";
import type { WorkspaceChange } from "./FileActions";

export function UploadLocationPicker({
  state,
  onChange,
  initialLocation,
  uploads,
  onUpload,
  onClose,
}: {
  state: WorkspaceState;
  onChange: WorkspaceChange;
  initialLocation: WorkspaceLocation;
  uploads: File[];
  onUpload: (location: WorkspaceLocation) => Promise<void>;
  onClose?: () => void;
}) {
  const [location, setLocation] = useState(initialLocation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folder = state.files.find((file) => file.id === location.folderId);
  const writable = folder
    ? folder.canShare
    : location.scope !== "Shared with me";
  const scopes: FileScope[] = ["My files", "Workspace files", "Shared with me"];
  return (
    <section
      aria-label="Choose upload location"
      className="flex min-h-0 flex-1 flex-col text-foreground"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {uploads.length} {uploads.length === 1 ? "file" : "files"} to upload
          </h2>
          <UploadPreview files={uploads} />
        </div>
        <Tabs
          value={location.scope}
          onValueChange={(value) => {
            const scope = scopes.find((scope) => scope === value);
            if (scope) {
              setLocation({ scope, folderId: null });
            }
          }}
        >
          <TabsList>
            {scopes.map((scope) => (
              <TabsTrigger key={scope} value={scope} label={scope} />
            ))}
          </TabsList>
          <TabsContent value={location.scope} className="mt-5">
            <WorkspaceFilesBrowser
              key={location.scope}
              files={state.files}
              state={state}
              onChange={onChange}
              scope={location.scope}
              folderId={location.folderId}
              onFolderChange={(folderId) =>
                setLocation({
                  scope:
                    state.files.find((file) => file.id === folderId)?.scope ??
                    location.scope,
                  folderId,
                })
              }
              onOpen={() => {}}
              destinationOnly
            />
          </TabsContent>
        </Tabs>
      </div>
      {uploads && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            {folder?.name ?? location.scope}
          </p>
          {error && (
            <p role="alert" className="w-full text-sm">
              {error}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              label="Cancel"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            />
            <Button
              label={
                busy
                  ? "Uploading…"
                  : `Upload ${uploads.length} ${uploads.length === 1 ? "file" : "files"} here`
              }
              variant="highlight"
              disabled={!writable || !uploads.length || busy}
              onClick={() => {
                if (onUpload) {
                  setBusy(true);
                  void onUpload(location)
                    .then(onClose)
                    .catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Upload failed."
                      )
                    )
                    .finally(() => setBusy(false));
                }
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
