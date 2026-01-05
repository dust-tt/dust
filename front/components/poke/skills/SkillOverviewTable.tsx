import { Chip } from "@dust-tt/sparkle";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SpaceType, UserType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillOverviewTableProps {
  skill: SkillType;
  author: UserType | null;
  spaces: SpaceType[];
}

export function SkillOverviewTable({
  skill,
  author,
  spaces,
}: SkillOverviewTableProps) {
  return (
    <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
      </div>
      <PokeTable>
        <PokeTableBody>
          <PokeTableRow>
            <PokeTableCell>Name</PokeTableCell>
            <PokeTableCell>{skill.name}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>sId</PokeTableCell>
            <PokeTableCell>{skill.sId}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Status</PokeTableCell>
            <PokeTableCell>
              <span className="capitalize">{skill.status}</span>
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Spaces</PokeTableCell>
            <PokeTableCell className="flex flex-row space-x-2">
              {spaces.map((s) => (
                <Chip
                  key={s.sId}
                  size="sm"
                  color={s.isRestricted ? "warning" : "blue"}
                >
                  {s.name}
                </Chip>
              ))}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Extended skill</PokeTableCell>
            <PokeTableCell>{skill.extendedSkillId ?? "None"}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Tools count</PokeTableCell>
            <PokeTableCell>{skill.tools.length}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Created at</PokeTableCell>
            <PokeTableCell>
              {skill.createdAt
                ? formatTimestampToFriendlyDate(skill.createdAt)
                : "N/A"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Updated at</PokeTableCell>
            <PokeTableCell>
              {skill.updatedAt
                ? formatTimestampToFriendlyDate(skill.updatedAt)
                : "N/A"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableCell>Created by</PokeTableCell>
            <PokeTableCell>
              {author ? `${author.fullName} (${author.email})` : "N/A"}
            </PokeTableCell>
          </PokeTableRow>
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
