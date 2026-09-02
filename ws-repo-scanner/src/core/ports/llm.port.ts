export interface LlmRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  // 0..1, progreso aproximado mientras el modelo va generando la respuesta
  onProgress?: (ratio: number) => void;
}

export interface LlmResponse {
  text: string;
  model: string;
}

export interface LlmPort {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
