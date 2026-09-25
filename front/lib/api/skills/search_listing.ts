import { searchSkills } from "@app/lib/api/skills/search";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  SearchSkillsResponseBody,
  SkillSearchFacetValue,
} from "@app/types/api/skills";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

function facetIds(values: SkillSearchFacetValue[] | undefined): string[] {
  return (values ?? []).map(({ value }) => value);
}

function facetCountsById(
  values: SkillSearchFacetValue[] | undefined
): Map<string, number> {
  return new Map((values ?? []).map(({ value, count }) => [value, count]));
}

/**
 * @cc [owner:tdraier,label:security] skill-search-listing-names
 * Resolve editor, child skill and space names for `searchSkills` results (listed skills and facets)
 * through resources, and only name child skills and spaces the caller can read: unreadable ones are
 * dropped from the facets.
 */
export async function searchSkillListings(
  auth: Authenticator,
  options: Parameters<typeof searchSkills>[1]
) {
  const result = await searchSkills(auth, options);
  if (result.isErr()) {
    return result;
  }

  const { facets: facetValues } = result.value;
  const editorIds = [
    ...new Set([
      ...result.value.skills.flatMap((skill) => skill.editorIds),
      ...facetIds(facetValues.editors),
    ]),
  ];
  const [users, childSkills, spaces] = await Promise.all([
    UserResource.fetchByIds(editorIds),
    facetValues.childSkills?.length
      ? SkillResource.fetchByIds(auth, facetIds(facetValues.childSkills), {
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        })
      : [],
    facetValues.spaces?.length
      ? SpaceResource.fetchByIds(auth, facetIds(facetValues.spaces))
      : [],
  ]);

  const editorsById = new Map(
    users.map((user) => {
      const { sId, fullName, image } = user.toJSON();
      return [sId, { sId, fullName, image }];
    })
  );
  const usersById = new Map(users.map((user) => [user.sId, user]));
  const childSkillCounts = facetCountsById(facetValues.childSkills);
  const spaceCounts = facetCountsById(facetValues.spaces);

  return new Ok<SearchSkillsResponseBody>({
    ...result.value,
    facets: {
      ...(facetValues.availability
        ? {
            availability: facetValues.availability.flatMap(
              ({ value, count }) => {
                const availability = SKILL_AVAILABILITIES.find(
                  (known) => known === value
                );
                return availability ? [{ availability, count }] : [];
              }
            ),
          }
        : {}),
      ...(facetValues.editors
        ? {
            editors: facetValues.editors
              .flatMap(({ value, count }) => {
                const editor = usersById.get(value);
                return editor ? [editor.toSearchFacetJSON(count)] : [];
              })
              .toSorted((a, b) => a.fullName.localeCompare(b.fullName)),
          }
        : {}),
      ...(facetValues.childSkills
        ? {
            childSkills: childSkills
              .map((skill) =>
                skill.toSearchFacetJSON(childSkillCounts.get(skill.sId) ?? 0)
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.spaces
        ? {
            // Unrestricted search can surface spaces the caller cannot read: never name them.
            spaces: spaces
              .filter((space) => auth.can("read", space))
              .map((space) =>
                space.toSearchFacetJSON(spaceCounts.get(space.sId) ?? 0)
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.usage ? { usage: facetValues.usage } : {}),
    },
    skills: result.value.skills.map((skill) => ({
      ...skill,
      editors: removeNulls(
        [...new Set(skill.editorIds)].map((id) => editorsById.get(id))
      ),
    })),
  });
}
