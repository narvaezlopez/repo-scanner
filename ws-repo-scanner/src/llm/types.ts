export interface LlmCompleteInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface LlmResult {
  text: string;
  model: string;
}

export interface LlmClient {
  complete(input: LlmCompleteInput): Promise<LlmResult>;
}
