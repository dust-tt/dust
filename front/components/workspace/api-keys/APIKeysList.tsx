import { Button, cn } from "@dust-tt/sparkle";
import _ from "lodash";
import React from "react";

import { timeAgoFrom } from "@app/lib/utils";
import type { GroupType } from "@app/types/groups";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";

import { prettifyGroupName } from "./utils";

type APIKeysListProps = {
  keys: KeyType[];
  groupsById: Record<ModelId, GroupType>;
  isRevoking: boolean;
  isGenerating: boolean;
  onRevoke: (key: KeyType) => Promise<void>;
  onEditCap: (key: KeyType) => void;
};

const getKeySpaces = (
  key: KeyType,
  groupsById: Record<ModelId, GroupType>
): string[] => {
  const group = groupsById[key.groupId];

  if (!group) {
    return [];
  }

  if (group.kind === "global" || key.scope == "restricted_group_only") {
    return [prettifyGroupName(group)];
  }

  return [GLOBAL_SPACE_NAME, prettifyGroupName(group)];
};

export const APIKeysList = ({
  keys,
  groupsById,
  isRevoking,
  isGenerating,
  onRevoke,
  onEditCap,
}: APIKeysListProps) => {
  return (
    <div className="space-y-4 divide-y divide-gray-200 dark:divide-gray-200-night">
      <ul role="list" className="pt-4">
        {_.sortBy(keys, (key) => key.status[0] + key.name).map((key) => (
          <li key={key.secret} className="px-2 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex flex-col">
                  <div className="flex flex-row">
                    <div className="my-auto mr-2 mt-0.5 flex flex-shrink-0">
                      <p
                        className={cn(
                          "mb-0.5 inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                          key.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        )}
                      >
                        {key.status === "active" ? "active" : "revoked"}
                      </p>
                    </div>
                    <div className="dd-privacy-mask">
                      <p
                        className={cn(
                          "truncate font-mono text-sm",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        Name: <strong>{key.name ?? "Unnamed"}</strong>
                      </p>
                      <p
                        className={cn(
                          "truncate font-mono text-sm",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        Domain:{" "}
                        <strong>
                          {process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}
                        </strong>
                      </p>
                      <p
                        className={cn(
                          "truncate font-mono text-sm",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        Scope:{" "}
                        <strong>
                          {getKeySpaces(key, groupsById).join(", ")}
                        </strong>
                      </p>
                      <p
                        className={cn(
                          "truncate font-mono text-sm",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        Monthly cap:{" "}
                        <strong>
                          {key.monthlyCapMicroUsd !== null
                            ? `$${(key.monthlyCapMicroUsd / 1_000_000).toFixed(2)}`
                            : "Unlimited"}
                        </strong>
                      </p>
                      <pre className="text-sm">{key.secret}</pre>
                      <p
                        className={cn(
                          "front-normal text-xs",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        Created {key.creator ? `by ${key.creator} ` : ""}
                        {timeAgoFrom(key.createdAt, {
                          useLongFormat: true,
                        })}{" "}
                        ago.
                      </p>
                      <p
                        className={cn(
                          "front-normal text-xs",
                          "text-muted-foreground dark:text-muted-foreground-night"
                        )}
                      >
                        {key.lastUsedAt ? (
                          <>
                            Last used&nbsp;
                            {timeAgoFrom(key.lastUsedAt, {
                              useLongFormat: true,
                            })}{" "}
                            ago.
                          </>
                        ) : (
                          <>Never used</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {key.status === "active" ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={isRevoking || isGenerating}
                    onClick={() => onEditCap(key)}
                    label="Edit cap"
                  />
                  <Button
                    variant="warning"
                    disabled={isRevoking || isGenerating}
                    onClick={async () => {
                      await onRevoke(key);
                    }}
                    label="Revoke"
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
