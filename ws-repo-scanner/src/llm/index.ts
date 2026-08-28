import { logger } from '../logger.js';
import { config } from '../config.js';
import { AnthropicLlmClient } from './anthropic.js';
import type { LlmClient } from './types.js';

export type { LlmClient, LlmCompleteInput, LlmResult } from './types.js';

logger.info({ model: config.ANTHROPIC_MODEL }, 'LLM: Anthropic API');

export const llm: LlmClient = new AnthropicLlmClient();
