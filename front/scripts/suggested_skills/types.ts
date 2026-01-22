/**
 * Types shared across suggested skills scripts.
 */

import { z } from "zod";

// Types for agent data (used by 1_get_agents.ts and 2_generate_skills.ts)

export type AgentTool = {
  mcp_server_view_id: number;
  tool_type: "internal" | "remote";
  tool_name: string | null;
  tool_description: string | null;
  internal_mcp_server_id: string | null;
  remote_mcp_server_id: string | null;
  internal_tool_name?: string;
  internal_tool_description?: string;
};

export type AgentDatasource = {
  datasource_description: string | null;
  connector_provider: string;
};

export type Agent = {
  agent_sid: string;
  agent_name: string;
  description: string;
  instructions: string | null;
  total_messages: number;
  first_usage: Date | null;
  last_usage: Date | null;
  tools: AgentTool[];
  dataSources: AgentDatasource[];
};

// Schemas and types for skill data (used by 2_generate_skills.ts, 3_extract_and_format.ts, 4_grade_skills.ts)

export const SkillToolSchema = z.object({
  tool_name: z.string(),
  tool_type: z.enum(["internal", "remote"]),
  tool_description: z.string(),
  mcp_server_view_id: z.number(),
  internal_mcp_server_id: z.string().nullable(),
  remote_mcp_server_id: z.string().nullable(),
  internal_tool_name: z.string().optional(),
  internal_tool_description: z.string().optional(),
});

export const SkillIconSchema = z.enum([
  "ActionCommandIcon",
  "ActionRocketIcon",
  "ActionSparklesIcon",
  "ActionBracesIcon",
  "ActionListCheckIcon",
  "ActionCubeIcon",
  "ActionLightbulbIcon",
  "ActionBriefcaseIcon",
  "ActionMagicIcon",
  "ActionBrainIcon",
]);

export const SkillSchema = z.object({
  name: z.string(),
  description_for_agents: z.string(),
  description_for_humans: z.string(),
  instructions: z.string(),
  agent_name: z.string(),
  icon: SkillIconSchema,
  requiredTools: z.array(SkillToolSchema),
  confidenceScore: z.number(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const GeneratedSkillsOutputSchema = z.object({
  skills: z.array(SkillSchema),
});

// Extended skill type with agent metadata (added after generation)
export type SkillWithAgentMetadata = Skill & {
  agent_sid: string;
  agent_description: string;
  agent_instructions: string | null;
};

// Schemas and types for grading (used by 4_grade_skills.ts)

export const GradeResultSchema = z.object({
  evaluation: z.number(),
  comment: z.string(),
  improvement: z.string().nullable(),
});

export type GradeResult = z.infer<typeof GradeResultSchema>;

export type GradedSkill = Skill & {
  grade: GradeResult;
};

export type GradingExample = {
  input: Skill;
  output: GradeResult;
};
