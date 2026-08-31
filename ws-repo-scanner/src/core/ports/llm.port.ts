export interface LlmRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
}

/** Puerto de salida: "completa este prompt". Lo implementa AnthropicLlmClient. */
export interface LlmPort {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
