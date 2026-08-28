import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { LlmClient, LlmCompleteInput, LlmResult } from './types.js';

export class AnthropicLlmClient implements LlmClient {
  private client: Anthropic | undefined;

  private getClient(): Anthropic {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }
    this.client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    return this.client;
  }

  async complete(input: LlmCompleteInput): Promise<LlmResult> {
    const response = await this.getClient().messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: input.maxTokens ?? config.LLM_MAX_TOKENS,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    });

    const text = response.content
      .filter(
        (block): block is Extract<typeof block, { type: 'text' }> =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    return { text, model: config.ANTHROPIC_MODEL };
  }
}
