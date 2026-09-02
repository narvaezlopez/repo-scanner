export interface LlmCompleteInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
  // 0..1, progreso aproximado mientras el modelo va generando la respuesta
  onProgress?: (ratio: number) => void;
}

export interface LlmResult {
  text: string;
  model: string;
}

export interface LlmClient {
  complete(input: LlmCompleteInput): Promise<LlmResult>;
}
