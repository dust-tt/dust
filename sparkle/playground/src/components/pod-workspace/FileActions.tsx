import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContainer,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DotsHorizontal,
  Edit04,
  Folder,
  Link01,
  Users01,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  audienceFor,
  effectivePermissions,
  filePermissions,
  descendants,
  filePath,
  configurePod,
  linkToPod,
  type WorkspaceState,
  transferFiles,
} from "./engine";
import { isContainer, type WorkspaceFile } from "./model";
import { workspacePods } from "./fixtures";
import { workspaceFileUrl } from "./fileLinks";

import { FileSharing } from "./FileSharing";

export type WorkspaceChange = (
  update: (state: WorkspaceState) => WorkspaceState
) => void;
const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
});

export function FileName({
  file,
  onChange,
}: {
  file: WorkspaceFile;
  onChange: WorkspaceChange;
}) {
  const [editing, setEditing] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: file.name },
  });
  const save = handleSubmit(({ name }) => {
    onChange((state) => ({
      ...state,
      files: state.files.map((item) =>
        item.id === file.id ? { ...item, name } : item
      ),
    }));
    setEditing(false);
  });
  return editing ? (
    <form
      onSubmit={save}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    >
      <input
        {...register("name")}
        aria-label="File name"
        autoFocus
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xl font-semibold"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
      <Button type="submit" label="Save" size="xs" variant="outline" />
      <Button
        type="button"
        label="Cancel"
        size="xs"
        variant="ghost"
        onClick={() => setEditing(false)}
      />
      {errors.name && (
        <p role="alert" className="w-full text-xs">
          {errors.name.message}
        </p>
      )}
    </form>
  ) : (
    <div className="group flex min-w-0 flex-1 items-center gap-2">
      <h1
        className="truncate text-xl font-semibold"
        onDoubleClick={() => {
          if (file.canShare && !file.fixedLocation) {
            reset({ name: file.name });
            setEditing(true);
          }
        }}
      >
        {file.name}
      </h1>
      {file.canShare && !file.fixedLocation && (
        <Button
          icon={Edit04}
          tooltip="Rename"
          variant="ghost"
          size="xs"
          onClick={() => {
            reset({ name: file.name });
            setEditing(true);
          }}
        />
      )}
    </div>
  );
}

export function FileActions({
  file,
  state,
  onChange,
  compact = false,
}: {
  file: WorkspaceFile;
  state: WorkspaceState;
  onChange: WorkspaceChange;
  compact?: boolean;
}) {
  const [action, setAction] = useState<
    "move" | "share" | "link" | "rename" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [destination, setDestination] = useState("");
  const { register, handleSubmit, reset } = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: file.name },
  });
  const subtree = new Set([
    file.id,
    ...descendants(state.files, file.id).map((item) => item.id),
  ]);
  const folders = state.files.filter(
    (item) =>
      isContainer(item) &&
      item.canShare &&
      !subtree.has(item.id) &&
      item.id !== "pods" &&
      !item.id.startsWith("pod:")
  );
  const gained = destination
    ? [
        ...audienceFor(
          state.files.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  parentId: destination,
                  permissions: {
                    inherit: filePermissions(file).inherit,
                    entries: [
                      ...effectivePermissions(state.files, file.id),
                    ].map(([principal, grant]) => ({
                      principal,
                      role: grant.role,
                    })),
                  },
                }
              : item
          ),
          file.id
        ),
      ].filter((person) => !audienceFor(state.files, file.id).has(person))
    : [];
  const copyLink = () => {
    void navigator.clipboard
      .writeText(workspaceFileUrl(file.id))
      .then(() => setNotice("Link copied"))
      .catch(() => setNotice("Couldn’t copy the link"));
  };
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      {notice && (
        <span role="status" className="text-xs text-muted-foreground">
          {notice}
        </span>
      )}
      {!compact && (
        <>
          <Button
            icon={Link01}
            tooltip="Copy link"
            variant="ghost"
            size="xs"
            onClick={copyLink}
          />
          <Button
            icon={Users01}
            tooltip="Share"
            variant="ghost"
            size="xs"
            onClick={() => setAction("share")}
          />
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={DotsHorizontal}
            tooltip={`Actions for ${file.name}`}
            variant="ghost"
            size="xs"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            label="Copy link"
            icon={Link01}
            onClick={copyLink}
          />
          <DropdownMenuItem
            label="Rename"
            icon={Edit04}
            disabled={!file.canShare || file.fixedLocation}
            onClick={() => {
              reset({ name: file.name });
              setAction("rename");
            }}
          />
          <DropdownMenuItem
            label="Move to…"
            icon={Folder}
            disabled={!file.canShare || file.fixedLocation}
            onClick={() => setAction("move")}
          />
          <DropdownMenuItem
            label="Share"
            icon={Users01}
            onClick={() => setAction("share")}
          />
          <DropdownMenuItem
            label="Link to pod…"
            icon={Link01}
            onClick={() => setAction("link")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {action === "rename"
                ? "Rename"
                : action === "move"
                  ? "Move to"
                  : action === "link"
                    ? "Linked pods"
                    : "Share"}
            </DialogTitle>
            <DialogDescription>{file.name}</DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              {action === "rename" && (
                <form
                  onSubmit={handleSubmit(({ name }) => {
                    onChange((current) => ({
                      ...current,
                      files: current.files.map((item) =>
                        item.id === file.id ? { ...item, name } : item
                      ),
                    }));
                    setAction(null);
                  })}
                  className="flex gap-2"
                >
                  <input
                    {...register("name")}
                    aria-label="File name"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2"
                  />
                  <Button type="submit" label="Save" variant="highlight" />
                </form>
              )}
              {action === "move" && (
                <>
                  <label className="text-sm">
                    Folder
                    <select
                      aria-label="Destination folder"
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-border bg-background p-2"
                    >
                      <option value="">Choose a folder</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {filePath(state.files, folder)} / {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {gained.length
                      ? `Also gives access to ${gained.join(", ")}. Existing access is retained.`
                      : "Existing access is retained."}
                  </p>
                  <div className="flex justify-end">
                    <Button
                      label="Move"
                      variant="highlight"
                      disabled={!destination || destination === file.parentId}
                      onClick={() => {
                        const folder = folders.find(
                          (item) => item.id === destination
                        );
                        if (folder) {
                          onChange((current) =>
                            transferFiles(
                              current,
                              [file.id],
                              { scope: folder.scope, folderId: folder.id },
                              "move"
                            )
                          );
                          setAction(null);
                        }
                      }}
                    />
                  </div>
                </>
              )}
              {action === "share" && (
                <FileSharing
                  file={file}
                  state={state}
                  onChange={onChange}
                  onClose={() => setAction(null)}
                />
              )}
              {action === "link" && (
                <>
                  {workspacePods.map((pod) => {
                    const linked = state.configurations[pod.id].references.some(
                      (ref) => ref.fileId === file.id
                    );
                    return (
                      <div
                        key={pod.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm">{pod.name}</span>
                        <Button
                          label={linked ? "Remove link" : "Link"}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onChange((current) =>
                              linked
                                ? configurePod(current, pod.id, {
                                    ...current.configurations[pod.id],
                                    references: current.configurations[
                                      pod.id
                                    ].references.filter(
                                      (ref) => ref.fileId !== file.id
                                    ),
                                  })
                                : linkToPod(current, pod.id, [file.id])
                            )
                          }
                        />
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Linking keeps the original and its access unchanged.
                  </p>
                </>
              )}
            </div>
          </DialogContainer>
        </DialogContent>
      </Dialog>
    </div>
  );
}
