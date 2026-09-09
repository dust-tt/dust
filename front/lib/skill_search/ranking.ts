export type { RankedResource as RankedSkill } from "@app/lib/search/ranking";
export {
  applySearchRanking,
  buildResourceMatchQuery as buildSkillMatchQuery,
  compareRankedResources as compareRankedSkills,
  getResourceMatchScore as getSkillSearchScore,
  getSearchRankingScore,
} from "@app/lib/search/ranking";
