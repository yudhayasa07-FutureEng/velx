export type ProjectContext = {
  projectId: string;
  projectName: string;
  requirements: Record<string, unknown>;
  blueprint?: Record<string, unknown>;
  currentTask?: { id: string; title: string; description: string };
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type Blueprint = {
  overview: { name: string; objective: string; category: string };
  scope: { included: string[]; excluded: string[] };
  deliverables: string[];
  roadmap: Array<{ phase: string; order: number; outcome: string }>;
  risks: Array<{ risk: string; mitigation: string }>;
  successCriteria: string[];
};

/** Server-side contract: the product depends on this interface, never a vendor SDK. */
export interface AIProvider {
  answer(context: ProjectContext, message: string): Promise<{ content: string }>;
  discover(context: ProjectContext): Promise<{ question: string; field: string; isOptional: boolean }>;
  generateBlueprint(context: ProjectContext): Promise<Blueprint>;
}
