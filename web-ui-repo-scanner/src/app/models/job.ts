// espejo de los tipos del backend (ws-repo-scanner/src/core/domain)

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type AnalysisStep = 'structure' | 'manifests' | 'llm' | 'done';

export interface DetectedTechnology {
  name: string;
  category: string;
  version?: string;
  evidence: string;
}

export interface InferredArchitecture {
  pattern: string;
  confidence: number;
  rationale: string;
  evidence: string[];
  layers?: string[];
}

export interface IdentifiedComponent {
  name: string;
  path: string;
  type: string;
  responsibility: string;
}

export interface Finding {
  title: string;
  description: string;
  evidence?: string;
}

export interface Risk extends Finding {
  severity: 'high' | 'medium' | 'low';
}

export interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisResult {
  functionalSummary: string;
  technologies: DetectedTechnology[];
  architecture: InferredArchitecture;
  findings: {
    components: IdentifiedComponent[];
    recommendations: Recommendation[];
    risks: Risk[];
  };
  generatedAt: string;
  model: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  source: { kind: string; name: string; bytes: number };
  progress: number;
  step: AnalysisStep | null;
  result: AnalysisResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
