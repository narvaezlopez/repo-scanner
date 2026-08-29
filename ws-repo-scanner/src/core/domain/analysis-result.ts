export type TechnologyCategory =
  | 'language'
  | 'framework'
  | 'runtime'
  | 'library'
  | 'database'
  | 'infrastructure'
  | 'tooling';

export interface DetectedTechnology {
  name: string;
  category: TechnologyCategory;
  version?: string;
  evidence: string;
}

export type ArchitecturePattern =
  | 'monolito'
  | 'monolito-modular'
  | 'mvc'
  | 'n-capas'
  | 'clean-architecture'
  | 'hexagonal'
  | 'microservicios'
  | 'event-driven'
  | 'serverless'
  | 'desconocida';

export interface InferredArchitecture {
  pattern: ArchitecturePattern;
  confidence: number;
  rationale: string;
  evidence: string[];
  layers?: string[];
}

export type ComponentType =
  | 'ui'
  | 'api'
  | 'service'
  | 'worker'
  | 'module'
  | 'database'
  | 'infrastructure'
  | 'config'
  | 'library';

export interface IdentifiedComponent {
  name: string;
  path: string;
  type: ComponentType;
  responsibility: string;
}

export type Severity = 'high' | 'medium' | 'low';

export interface Risk {
  title: string;
  description: string;
  severity: Severity;
  evidence?: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: Severity;
}

export interface AnalysisFindings {
  components: IdentifiedComponent[];
  recommendations: Recommendation[];
  risks: Risk[];
}

export interface AnalysisResult {
  functionalSummary: string;
  technologies: DetectedTechnology[];
  architecture: InferredArchitecture;
  findings: AnalysisFindings;
  generatedAt: string;
  model: string;
}
