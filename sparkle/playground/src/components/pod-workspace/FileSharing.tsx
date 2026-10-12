import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Folder,
  Input,
  Link01,
  Lock01,
  Users01,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  effectivePermissions,
  filePermissions,
  setFilePermissions,
  type WorkspaceState,
} from "./engine";
import { workspacePeople } from "./fixtures";
import type { FilePermissions, FileRole, WorkspaceFile } from "./model";
import type { WorkspaceChange } from "./FileActions";
import { workspaceFileUrl } from "./fileLinks";

const roles: { value: FileRole; label: string; description: string }[] = [
  { value: "viewer", label: "Viewer", description: "Can view." },
  {
    value: "commenter",
    label: "Commenter",
    description: "Can view and comment.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Can view, comment, and edit.",
  },
];
const personSchema = z.object({
  person: z
    .string()
    .trim()
    .min(1, "Enter a name or email.")
    .refine(
      (value) =>
        workspacePeople.some((person) =>
          [person.id, person.name, person.email].some(
            (name) => name.toLowerCase() === value.toLowerCase()
          )
        ) || z.string().email().safeParse(value).success,
      "Choose a person or enter an email address."
    ),
});
function RoleMenu({
  role,
  name,
  onChange,
  allowRemove = false,
  disabled = false,
}: {
  role: FileRole;
  name: string;
  onChange: (role: FileRole) => void;
  allowRemove?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={
            roles.find((item) => item.value === role)?.label ?? "No access"
          }
          tooltip={`Access for ${name}`}
          variant="ghost"
          size="sm"
          isSelect
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {roles.map((item) => (
          <DropdownMenuItem
            key={item.value}
            label={item.label}
            description={item.description}
            onClick={() => onChange(item.value)}
          />
        ))}
        {allowRemove && (
          <DropdownMenuItem
            label="Remove access"
            onClick={() => onChange("none")}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileSharing({
  file,
  state,
  onChange,
  onClose,
}: {
  file: WorkspaceFile;
  state: WorkspaceState;
  onChange: WorkspaceChange;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilePermissions>(() =>
    filePermissions(file)
  );
  const [newRole, setNewRole] = useState<FileRole>("editor");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ person: string }>({
    resolver: zodResolver(personSchema),
    defaultValues: { person: "" },
  });
  const query = watch("person").trim();
  const preview = state.files.map((item) =>
    item.id === file.id ? { ...item, permissions: draft } : item
  );
  const effective = effectivePermissions(preview, file.id);
  const parent = state.files.find((item) => item.id === file.parentId);
  const workspaceGrant = effective.get("workspace");
  const workspaceRole = workspaceGrant?.role ?? "none";
  const entries = [...effective]
    .filter(([principal]) => principal !== "workspace")
    .sort(([a], [b]) =>
      a === "Emma" ? -1 : b === "Emma" ? 1 : a.localeCompare(b)
    );
  const setRole = (principal: string, role: FileRole) => {
    setError("");
    setDraft((current) => ({
      ...current,
      entries: [
        ...current.entries.filter((entry) => entry.principal !== principal),
        { principal, role },
      ],
    }));
  };
  const addPerson = (value: string) => {
    const known = workspacePeople.find((person) =>
      [person.id, person.name, person.email].some(
        (name) => name.toLowerCase() === value.toLowerCase()
      )
    );
    setRole(known?.id ?? value.toLowerCase(), newRole);
    reset();
  };
  const suggestions = query
    ? workspacePeople.filter(
        (person) =>
          person.id !== "Emma" &&
          `${person.name} ${person.email}`
            .toLowerCase()
            .includes(query.toLowerCase())
      )
    : [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(filePermissions(file));
  return (
    <div className="flex flex-col gap-6">
      {file.canShare && (
        <div className="flex flex-col gap-2">
          <form
            className="flex items-start gap-2"
            onSubmit={handleSubmit(({ person }) => addPerson(person))}
          >
            <div className="min-w-0 flex-1">
              <Input
                {...register("person")}
                aria-label="Add people"
                placeholder="Add people by name or email"
                size="md"
                message={errors.person?.message}
                messageStatus={errors.person ? "error" : "default"}
              />
            </div>
            <RoleMenu role={newRole} name="new person" onChange={setNewRole} />
            <Button
              type="submit"
              label="Add"
              variant="outline"
              disabled={!query}
            />
          </form>
          {!!suggestions.length && (
            <div
              className="rounded-lg border border-border p-1"
              aria-label="Suggested people"
            >
              {suggestions.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => addPerson(person.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-hover"
                >
                  <Avatar name={person.name} size="sm" isRounded />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm">{person.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <section aria-label="People" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">People</h3>
        <div className="flex max-h-64 flex-col gap-4 overflow-y-auto">
          {entries.map(([principal, grant]) => {
            const person = workspacePeople.find(
              (person) => person.id === principal
            );
            const name = person?.name ?? principal;
            const inherited = grant.sourceId !== file.id;
            return (
              <div key={principal} className="flex items-center gap-3">
                <Avatar name={name} size="sm" isRounded />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {name}
                    {principal === "Emma" ? " (you)" : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inherited
                      ? `From ${state.files.find((item) => item.id === grant.sourceId)?.name ?? "parent folder"}`
                      : (person?.email ??
                        (grant.role === "none" ? "Access removed" : ""))}
                  </p>
                </div>
                {principal === "Emma" ? (
                  <span className="px-3 text-sm text-muted-foreground">
                    Owner
                  </span>
                ) : (
                  <RoleMenu
                    role={grant.role}
                    name={name}
                    onChange={(role) => setRole(principal, role)}
                    allowRemove
                    disabled={!file.canShare}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section
        aria-label="General access"
        className="flex flex-col gap-3 border-t border-border pt-5"
      >
        <h3 className="text-sm font-semibold">General access</h3>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            {workspaceRole === "none" ? (
              <Lock01 className="size-4" />
            ) : (
              <Users01 className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={
                    workspaceRole === "none" ? "Restricted" : "Dust workspace"
                  }
                  tooltip="General access"
                  variant="ghost"
                  size="sm"
                  isSelect
                  disabled={!file.canShare}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Restricted"
                  description="Only people with access can open."
                  onClick={() => setRole("workspace", "none")}
                />
                <DropdownMenuItem
                  label="Dust workspace"
                  description="Everyone in the workspace can open."
                  onClick={() => setRole("workspace", "viewer")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="mt-1 text-xs text-muted-foreground">
              {workspaceRole === "none"
                ? "Only people with access can open."
                : "Workspace members"}
            </p>
          </div>
          {workspaceRole !== "none" && (
            <RoleMenu
              role={workspaceRole}
              name="Dust workspace"
              onChange={(role) => setRole("workspace", role)}
              disabled={!file.canShare}
            />
          )}
        </div>
        {parent && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Folder className="size-4" />
              {draft.inherit ? `Inherits from ${parent.name}` : "Custom access"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label="Change"
                  tooltip="Change inheritance"
                  variant="ghost"
                  size="xs"
                  isSelect
                  disabled={!file.canShare}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Use custom access"
                  description="Stop inheriting changes from the parent."
                  onClick={() =>
                    setDraft({
                      inherit: false,
                      entries: [...effective]
                        .filter(([principal]) => principal !== "Emma")
                        .map(([principal, grant]) => ({
                          principal,
                          role: grant.role,
                        })),
                    })
                  }
                />
                <DropdownMenuItem
                  label="Use parent access"
                  description="Replace this file’s permissions with its parent’s."
                  onClick={() => setDraft({ inherit: true, entries: [] })}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="text-sm text-foreground-warning">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          label={copied ? "Link copied" : "Copy link"}
          icon={Link01}
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              .writeText(workspaceFileUrl(file.id))
              .then(() => setCopied(true))
              .catch(() => setError("Couldn’t copy the link."));
          }}
        />
        <div className="flex gap-2">
          {dirty && <Button label="Cancel" variant="ghost" onClick={onClose} />}
          <Button
            label={dirty ? "Save changes" : "Done"}
            variant="highlight"
            onClick={() => {
              try {
                if (dirty) {
                  setFilePermissions(state, file.id, draft);
                  onChange((current) =>
                    setFilePermissions(current, file.id, draft)
                  );
                }
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Couldn’t save sharing settings."
                );
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
