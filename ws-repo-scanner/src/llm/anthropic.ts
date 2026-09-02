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
    const maxTokens = input.maxTokens ?? config.LLM_MAX_TOKENS;
    // heurística ~4 caracteres/token para estimar cuánto falta mientras llega el streaming
    const approxMaxChars = maxTokens * 4;

    let reported = 0;
    const report = (ratio: number): void => {
      const next = Math.max(reported, Math.min(0.97, ratio));
      if (next > reported) {
        reported = next;
        input.onProgress?.(next);
      }
    };

    const heartbeat = setInterval(() => report(reported + (0.97 - reported) * 0.05), 1500);

    try {
      const stream = this.getClient().messages.stream({
        model: config.ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.prompt }],
      });

      stream.on('text', (_delta, textSnapshot) => {
        report(textSnapshot.length / approxMaxChars);
      });

      const message = await stream.finalMessage();
      const text = message.content
        .filter(
          (block): block is Extract<typeof block, { type: 'text' }> =>
            block.type === 'text',
        )
        .map((block) => block.text)
        .join('\n');

      return { text, model: config.ANTHROPIC_MODEL };
    } finally {
      clearInterval(heartbeat);
    }
  }
}
