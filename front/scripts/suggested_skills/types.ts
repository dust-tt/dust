/**
 * Types shared across suggested skills scripts.
 */

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
  connector_provider: string | null;
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

// Types for skill data (used by 3_extract_and_format.ts and 4_grade_skills.ts)

export type SkillTool = {
  tool_name: string;
  tool_type: "internal" | "remote";
  tool_description: string;
  mcp_server_view_id: number;
  internal_mcp_server_id?: string;
  remote_mcp_server_id?: string;
  internal_tool_name?: string;
  internal_tool_description?: string;
};

export type Skill = {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  agent_name: string;
  icon: string;
  requiredTools?: SkillTool[];
  confidenceScore: number;
  agent_sid?: string;
  agent_description?: string;
  agent_instructions?: string | null;
};

// Types for grading (used by 4_grade_skills.ts)

export type GradeResult = {
  evaluation: number;
  comment: string;
  improvement: string | null;
};

export type GradedSkill = Skill & {
  grade: GradeResult;
};

export type GradingExample = {
  input: Skill;
  output: GradeResult;
};
