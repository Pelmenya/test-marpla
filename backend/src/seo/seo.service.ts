import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventSourceMessage, EventSourceParserStream } from 'eventsource-parser/stream';

export interface SeoResult {
  title: string;
  meta_description: string;
  h1: string;
  description: string;
  bullets: string[];
}

export interface SseEvent {
  event: 'token' | 'end' | 'error';
  data: Record<string, unknown>;
}

const REQUIRED_FIELDS: (keyof SeoResult)[] = [
  'title',
  'meta_description',
  'h1',
  'description',
  'bullets',
];

@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);
  private readonly flowiseUrl: string;
  private readonly chatflowId: string;
  private readonly timeoutMs: number;
  private readonly authHeader: string | null;
  private readonly openaiBasePath: string | null;

  constructor(private readonly config: ConfigService) {
    this.flowiseUrl = this.config.getOrThrow<string>('FLOWISE_API_URL');
    this.chatflowId = this.config.getOrThrow<string>('FLOWISE_CHATFLOW_ID');
    this.timeoutMs = Number(this.config.get('FLOWISE_TIMEOUT_MS', 30000));
    this.openaiBasePath = this.config.get<string>('OPENAI_BASE_PATH') || null;

    const user = this.config.get<string>('FLOWISE_USERNAME');
    const pass = this.config.get<string>('FLOWISE_PASSWORD');
    this.authHeader =
      user && pass
        ? 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
        : null;
  }

  /**
   * Non-streaming: calls Flowise, waits for full response, validates JSON.
   */
  async generate(dto: {
    product_name: string;
    category: string;
    keywords: string;
  }): Promise<SeoResult> {
    const response = await this.callFlowise(dto, false);
    const body = await response.json();

    // Flowise returns { json: { title, meta_description, ... } } for structured output
    if (body?.json && typeof body.json === 'object') {
      return this.parseAndValidate(JSON.stringify(body.json));
    }

    const text: string = body?.text ?? '';
    if (!text.trim()) {
      throw new FlowiseError('EMPTY_RESPONSE', 'LLM returned an empty response');
    }

    return this.parseAndValidate(text);
  }

  /**
   * Streaming: calls Flowise with streaming, yields SSE events.
   * Buffers the full response and validates JSON at the end.
   */
  async *generateStream(dto: {
    product_name: string;
    category: string;
    keywords: string;
  }): AsyncGenerator<SseEvent> {
    const response = await this.callFlowise(dto, true);

    if (!response.body) {
      throw new FlowiseError('EMPTY_RESPONSE', 'Flowise returned no response body');
    }

    const contentType = response.headers.get('content-type') ?? '';

    // Flowise may return plain JSON instead of SSE when streaming is not supported
    if (contentType.includes('application/json')) {
      const body = await response.json();
      if (body?.json && typeof body.json === 'object') {
        const result = this.parseAndValidate(JSON.stringify(body.json));
        yield { event: 'end', data: { result } };
        return;
      }
      const text: string = body?.text ?? '';
      if (!text.trim()) {
        yield { event: 'error', data: { error: 'LLM returned an empty response', code: 'EMPTY_RESPONSE' } };
        return;
      }
      const result = this.parseAndValidate(text);
      yield { event: 'end', data: { result } };
      return;
    }

    let buffer = '';

    const stream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream());

    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const event = value as EventSourceMessage;

        if (event.event === 'end' || event.data === '[DONE]') {
          break;
        }

        // Flowise streams token data as plain text or JSON
        const tokenText = this.extractToken(event.data);
        if (tokenText) {
          buffer += tokenText;
          yield { event: 'token', data: { token: tokenText } };
        }
      }
    } finally {
      reader.releaseLock();
    }

    // After stream ends, validate the full response
    if (!buffer.trim()) {
      yield {
        event: 'error',
        data: { error: 'LLM returned an empty response', code: 'EMPTY_RESPONSE' },
      };
      return;
    }

    try {
      const result = this.parseAndValidate(buffer);
      yield { event: 'end', data: { result } };
    } catch (err) {
      try {
        const jsonMatch = buffer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = this.parseAndValidate(jsonMatch[0]);
          yield { event: 'end', data: { result } };
          return;
        }
      } catch {
        // fallthrough
      }

      yield {
        event: 'error',
        data: {
          error: err instanceof Error ? err.message : 'Failed to parse LLM response',
          code: 'INVALID_JSON',
        },
      };
    }
  }

  private async callFlowise(
    dto: { product_name: string; category: string; keywords: string },
    streaming: boolean,
  ): Promise<Response> {
    const url = `${this.flowiseUrl}/api/v1/prediction/${this.chatflowId}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const question = [
      `Product Name: ${dto.product_name}`,
      `Category: ${dto.category}`,
      `Keywords: ${dto.keywords}`,
    ].join('\n');

    const payload = {
      question,
      overrideConfig: {
        ...(this.openaiBasePath ? { basePath: this.openaiBasePath } : {}),
      },
      streaming,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new FlowiseError(
          'TIMEOUT',
          `Flowise did not respond within ${this.timeoutMs}ms`,
        );
      }
      if (err instanceof TypeError && (err as any).cause) {
        throw new FlowiseError(
          'SERVICE_UNAVAILABLE',
          `Cannot connect to Flowise at ${this.flowiseUrl}`,
        );
      }
      throw new FlowiseError('SERVICE_UNAVAILABLE', `Flowise request failed: ${err}`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.error(`Flowise returned ${response.status}: ${errorBody}`);
      throw new FlowiseError(
        'SERVICE_UNAVAILABLE',
        `Flowise returned HTTP ${response.status}`,
      );
    }

    return response;
  }

  private extractToken(data: string): string {
    // Flowise may send tokens as plain text or as JSON { "token": "..." }
    try {
      const parsed = JSON.parse(data);
      return parsed.token ?? parsed.text ?? data;
    } catch {
      return data;
    }
  }

  private parseAndValidate(text: string): SeoResult {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new FlowiseError(
        'INVALID_JSON',
        `LLM output is not valid JSON: ${text.slice(0, 200)}`,
      );
    }

    for (const field of REQUIRED_FIELDS) {
      if (parsed[field] === undefined || parsed[field] === null) {
        throw new FlowiseError(
          'INVALID_JSON',
          `Missing required field "${field}" in LLM response`,
        );
      }
    }

    // Normalize bullets: accept string (comma-separated) or array
    let bullets: string[];
    if (Array.isArray(parsed.bullets)) {
      bullets = parsed.bullets.map(String);
    } else if (typeof parsed.bullets === 'string') {
      bullets = parsed.bullets.split(',').map((b: string) => b.trim()).filter(Boolean);
    } else {
      throw new FlowiseError('INVALID_JSON', '"bullets" must be a string or array');
    }

    return {
      title: String(parsed.title),
      meta_description: String(parsed.meta_description),
      h1: String(parsed.h1),
      description: String(parsed.description),
      bullets,
    };
  }
}

export class FlowiseError extends Error {
  constructor(
    public readonly code:
      | 'TIMEOUT'
      | 'EMPTY_RESPONSE'
      | 'INVALID_JSON'
      | 'SERVICE_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'FlowiseError';
  }
}
