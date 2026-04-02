import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService, FlowiseError, SeoResult, SseEvent } from './seo.service';

const VALID_RESULT: SeoResult = {
    title: 'Test Title',
    meta_description: 'Test meta description',
    h1: 'Test H1',
    description: 'Test description',
    bullets: ['Bullet 1', 'Bullet 2'],
};

describe('SeoController', () => {
    let controller: SeoController;
    let seoService: jest.Mocked<SeoService>;

    beforeEach(async () => {
        const mockSeoService = {
            generate: jest.fn(),
            generateStream: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SeoController],
            providers: [
                { provide: SeoService, useValue: mockSeoService },
            ],
        }).compile();

        controller = module.get<SeoController>(SeoController);
        seoService = module.get(SeoService) as jest.Mocked<SeoService>;
    });

    const dto = {
        product_name: 'iPhone 15 Pro',
        category: 'Смартфоны',
        keywords: 'apple, iphone',
    };

    function mockResponse() {
        const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn(),
            flushHeaders: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
        };
        return res;
    }

    describe('non-streaming (stream=false)', () => {
        it('should return 200 with SEO result', async () => {
            seoService.generate.mockResolvedValueOnce(VALID_RESULT);
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
            expect(res.json).toHaveBeenCalledWith(VALID_RESULT);
        });

        it('should return 504 on TIMEOUT error', async () => {
            seoService.generate.mockRejectedValueOnce(
                new FlowiseError('TIMEOUT', 'Flowise did not respond'),
            );
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'TIMEOUT' }),
            );
        });

        it('should return 502 on EMPTY_RESPONSE error', async () => {
            seoService.generate.mockRejectedValueOnce(
                new FlowiseError('EMPTY_RESPONSE', 'LLM returned empty'),
            );
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
        });

        it('should return 502 on INVALID_JSON error', async () => {
            seoService.generate.mockRejectedValueOnce(
                new FlowiseError('INVALID_JSON', 'Missing field'),
            );
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'INVALID_JSON' }),
            );
        });

        it('should return 503 on SERVICE_UNAVAILABLE error', async () => {
            seoService.generate.mockRejectedValueOnce(
                new FlowiseError('SERVICE_UNAVAILABLE', 'Flowise down'),
            );
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
        });

        it('should return 500 on unexpected error', async () => {
            seoService.generate.mockRejectedValueOnce(new Error('unexpected'));
            const res = mockResponse();

            await controller.generateSeo(dto, 'false', res);

            expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        });
    });

    describe('streaming (default)', () => {
        it('should set SSE headers and write events', async () => {
            async function* mockStream(): AsyncGenerator<SseEvent> {
                yield { event: 'end', data: { result: VALID_RESULT } };
            }
            seoService.generateStream = jest.fn().mockReturnValue(mockStream());
            const res = mockResponse();

            await controller.generateSeo(dto, undefined, res);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
            expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
            expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
            expect(res.flushHeaders).toHaveBeenCalled();
            expect(res.write).toHaveBeenCalledWith(
                expect.stringContaining('event: end'),
            );
            expect(res.end).toHaveBeenCalled();
        });

        it('should write error event on FlowiseError during streaming', async () => {
            seoService.generateStream = jest.fn().mockImplementation(function* () {
                throw new FlowiseError('TIMEOUT', 'timeout');
            });
            const res = mockResponse();

            await controller.generateSeo(dto, undefined, res);

            expect(res.write).toHaveBeenCalledWith(
                expect.stringContaining('"code":"TIMEOUT"'),
            );
            expect(res.end).toHaveBeenCalled();
        });

        it('should write generic error on unexpected error during streaming', async () => {
            seoService.generateStream = jest.fn().mockImplementation(function* () {
                throw new Error('boom');
            });
            const res = mockResponse();

            await controller.generateSeo(dto, undefined, res);

            expect(res.write).toHaveBeenCalledWith(
                expect.stringContaining('Internal server error'),
            );
        });
    });
});
