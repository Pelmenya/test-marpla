import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SeoService, FlowiseError } from './seo.service';

const VALID_SEO_JSON = {
    title: 'iPhone 15 Pro — Flagship Smartphone',
    meta_description: 'Buy iPhone 15 Pro with titanium design and A17 chip.',
    h1: 'iPhone 15 Pro',
    description: 'The iPhone 15 Pro is the best smartphone ever made.',
    bullets: 'Titanium design, A17 Pro chip, 48MP camera, USB-C, Action Button',
};

function createMockConfig(overrides: Record<string, string> = {}) {
    const values: Record<string, string> = {
        FLOWISE_API_URL: 'http://flowise:3000',
        FLOWISE_CHATFLOW_ID: 'test-chatflow-id',
        FLOWISE_TIMEOUT_MS: '30000',
        ...overrides,
    };
    return {
        getOrThrow: jest.fn((key: string) => {
            if (values[key] !== undefined) return values[key];
            throw new Error(`Missing ${key}`);
        }),
        get: jest.fn((key: string, defaultVal?: unknown) => {
            return values[key] ?? defaultVal ?? undefined;
        }),
    };
}

describe('SeoService', () => {
    let service: SeoService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SeoService,
                { provide: ConfigService, useValue: createMockConfig() },
            ],
        }).compile();

        service = module.get<SeoService>(SeoService);
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const dto = {
        product_name: 'iPhone 15 Pro',
        category: 'Смартфоны',
        keywords: 'apple, iphone, флагман',
    };

    describe('generate (non-streaming)', () => {
        it('should return parsed SEO result from Flowise json field', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: VALID_SEO_JSON }),
            });

            const result = await service.generate(dto);

            expect(result.title).toBe(VALID_SEO_JSON.title);
            expect(result.meta_description).toBe(VALID_SEO_JSON.meta_description);
            expect(result.h1).toBe(VALID_SEO_JSON.h1);
            expect(result.description).toBe(VALID_SEO_JSON.description);
            expect(result.bullets).toEqual([
                'Titanium design',
                'A17 Pro chip',
                '48MP camera',
                'USB-C',
                'Action Button',
            ]);
        });

        it('should return parsed SEO result from Flowise text field', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: JSON.stringify(VALID_SEO_JSON) }),
            });

            const result = await service.generate(dto);
            expect(result.title).toBe(VALID_SEO_JSON.title);
        });

        it('should handle bullets as array', async () => {
            const seoWithArrayBullets = {
                ...VALID_SEO_JSON,
                bullets: ['Titanium', 'A17 chip', 'USB-C'],
            };
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: seoWithArrayBullets }),
            });

            const result = await service.generate(dto);
            expect(result.bullets).toEqual(['Titanium', 'A17 chip', 'USB-C']);
        });

        it('should throw EMPTY_RESPONSE when Flowise returns empty text', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: '' }),
            });

            await expect(service.generate(dto)).rejects.toMatchObject({
                name: 'FlowiseError',
                code: 'EMPTY_RESPONSE',
            });
        });

        it('should throw INVALID_JSON when LLM returns invalid JSON', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'not a json at all' }),
            });

            await expect(service.generate(dto)).rejects.toMatchObject({
                code: 'INVALID_JSON',
            });
        });

        it('should not leak LLM output in INVALID_JSON error message', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'secret LLM output here' }),
            });

            try {
                await service.generate(dto);
            } catch (err) {
                expect((err as FlowiseError).message).not.toContain('secret');
                expect((err as FlowiseError).message).toBe('Failed to parse LLM response as JSON');
            }
        });

        it('should throw INVALID_JSON when required field is missing', async () => {
            const incomplete = { title: 'Test', meta_description: 'Test' };
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: incomplete }),
            });

            await expect(service.generate(dto)).rejects.toMatchObject({
                code: 'INVALID_JSON',
            });
        });

        it('should throw TIMEOUT on AbortSignal timeout', async () => {
            const err = new DOMException('Signal timed out', 'TimeoutError');
            fetchSpy.mockRejectedValueOnce(err);

            await expect(service.generate(dto)).rejects.toMatchObject({
                code: 'TIMEOUT',
            });
        });

        it('should throw SERVICE_UNAVAILABLE on connection error', async () => {
            const err = new TypeError('fetch failed');
            (err as any).cause = new Error('ECONNREFUSED');
            // 3 attempts (initial + 2 retries)
            fetchSpy.mockRejectedValue(err);

            await expect(service.generate(dto)).rejects.toMatchObject({
                code: 'SERVICE_UNAVAILABLE',
            });
        });

        it('should retry on HTTP 502 and succeed on second attempt', async () => {
            fetchSpy
                .mockResolvedValueOnce({
                    ok: false,
                    status: 502,
                    text: async () => 'Bad Gateway',
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ json: VALID_SEO_JSON }),
                });

            const result = await service.generate(dto);
            expect(result.title).toBe(VALID_SEO_JSON.title);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('should throw SERVICE_UNAVAILABLE after retries exhausted', async () => {
            fetchSpy.mockResolvedValue({
                ok: false,
                status: 503,
                text: async () => 'Service Unavailable',
            });

            await expect(service.generate(dto)).rejects.toMatchObject({
                code: 'SERVICE_UNAVAILABLE',
            });
            // initial + 2 retries = 3
            expect(fetchSpy).toHaveBeenCalledTimes(3);
        });

        it('should send correct payload to Flowise', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: VALID_SEO_JSON }),
            });

            await service.generate(dto);

            expect(fetchSpy).toHaveBeenCalledWith(
                'http://flowise:3000/api/v1/prediction/test-chatflow-id',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('iPhone 15 Pro'),
                }),
            );

            const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
            expect(body.question).toContain('Product Name: iPhone 15 Pro');
            expect(body.question).toContain('Category: Смартфоны');
            expect(body.question).toContain('Keywords: apple, iphone, флагман');
            expect(body.streaming).toBe(false);
        });
    });

    describe('generate with auth', () => {
        it('should send Authorization header when credentials configured', async () => {
            const moduleWithAuth = await Test.createTestingModule({
                providers: [
                    SeoService,
                    {
                        provide: ConfigService,
                        useValue: createMockConfig({
                            FLOWISE_USERNAME: 'admin',
                            FLOWISE_PASSWORD: 'secret',
                        }),
                    },
                ],
            }).compile();

            const serviceWithAuth = moduleWithAuth.get<SeoService>(SeoService);
            const spy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: VALID_SEO_JSON }),
            } as any);

            await serviceWithAuth.generate(dto);

            const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
            expect(headers['Authorization']).toMatch(/^Basic /);
            spy.mockRestore();
        });
    });

    describe('generate with OPENAI_BASE_PATH', () => {
        it('should include basePath in overrideConfig', async () => {
            const moduleWithPath = await Test.createTestingModule({
                providers: [
                    SeoService,
                    {
                        provide: ConfigService,
                        useValue: createMockConfig({
                            OPENAI_BASE_PATH: 'https://proxy.example.com/v1',
                        }),
                    },
                ],
            }).compile();

            const serviceWithPath = moduleWithPath.get<SeoService>(SeoService);
            const spy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => ({ json: VALID_SEO_JSON }),
            } as any);

            await serviceWithPath.generate(dto);

            const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
            expect(body.overrideConfig.basePath).toBe('https://proxy.example.com/v1');
            spy.mockRestore();
        });
    });

    describe('generateStream', () => {
        it('should yield end event with result when Flowise returns JSON', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: {},
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => ({ json: VALID_SEO_JSON }),
            });

            const events = [];
            for await (const event of service.generateStream(dto)) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0].event).toBe('end');
            expect((events[0].data as any).result.title).toBe(VALID_SEO_JSON.title);
        });

        it('should yield error event when Flowise returns empty JSON response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: {},
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => ({ text: '' }),
            });

            const events = [];
            for await (const event of service.generateStream(dto)) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0].event).toBe('error');
            expect((events[0].data as any).code).toBe('EMPTY_RESPONSE');
        });

        it('should throw FlowiseError when response has no body', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: null,
                headers: new Headers(),
            });

            await expect(async () => {
                for await (const _ of service.generateStream(dto)) {
                    // consume
                }
            }).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
        });

        it('should handle SSE stream with token events', async () => {
            const sseData = [
                'event: message\ndata: {"token":"Hello"}\n\n',
                'event: message\ndata: {"token":" World"}\n\n',
                'data: [DONE]\n\n',
            ].join('');

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData));
                    controller.close();
                },
            });

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: readable,
                headers: new Headers({ 'content-type': 'text/event-stream' }),
            });

            const events = [];
            for await (const event of service.generateStream(dto)) {
                events.push(event);
            }

            // Buffer "Hello World" is not valid JSON → error
            const lastEvent = events[events.length - 1];
            expect(lastEvent.event).toBe('error');
            expect((lastEvent.data as any).code).toBe('INVALID_JSON');
        });

        it('should parse JSON from SSE stream buffer', async () => {
            const jsonResult = JSON.stringify(VALID_SEO_JSON);
            const sseData = `data: ${jsonResult}\n\ndata: [DONE]\n\n`;

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData));
                    controller.close();
                },
            });

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: readable,
                headers: new Headers({ 'content-type': 'text/event-stream' }),
            });

            const events = [];
            for await (const event of service.generateStream(dto)) {
                events.push(event);
            }

            const endEvent = events.find((e) => e.event === 'end');
            expect(endEvent).toBeDefined();
            expect((endEvent!.data as any).result.title).toBe(VALID_SEO_JSON.title);
        });

        it('should yield EMPTY_RESPONSE when SSE stream has no data', async () => {
            const sseData = 'data: [DONE]\n\n';

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData));
                    controller.close();
                },
            });

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                body: readable,
                headers: new Headers({ 'content-type': 'text/event-stream' }),
            });

            const events = [];
            for await (const event of service.generateStream(dto)) {
                events.push(event);
            }

            expect(events).toHaveLength(1);
            expect(events[0].event).toBe('error');
            expect((events[0].data as any).code).toBe('EMPTY_RESPONSE');
        });
    });
});
