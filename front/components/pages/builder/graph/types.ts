interface BaseGraphNode {
  id: string;
  name: string;
  connectionCount: number;
}

export interface AgentGraphNode extends BaseGraphNode {
  type: "agent";
  pictureUrl: string;
}

export interface SkillGraphNode extends BaseGraphNode {
  type: "skill";
  icon: string | null;
}

export type GraphNode = AgentGraphNode | SkillGraphNode;

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
