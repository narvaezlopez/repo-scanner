export interface LlmRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
}

export interface LlmPort {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
