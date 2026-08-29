import { AnthropicLlmClient } from './anthropic.js';
import type { LlmClient } from './types.js';

export const llm: LlmClient = new AnthropicLlmClient();
