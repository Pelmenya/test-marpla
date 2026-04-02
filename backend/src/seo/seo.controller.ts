import {
  Controller,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { GenerateSeoDto } from './dto/generate-seo.dto';
import { SeoService, FlowiseError, SseEvent } from './seo.service';

@Controller('api')
export class SeoController {
  private readonly logger = new Logger(SeoController.name);

  constructor(private readonly seoService: SeoService) {}

  @Post('generate-seo')
  async generateSeo(
    @Body() dto: GenerateSeoDto,
    @Query('stream') stream: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const isStream = stream !== 'false';

    if (isStream) {
      await this.handleStreaming(dto, res);
    } else {
      await this.handleNonStreaming(dto, res);
    }
  }

  private async handleNonStreaming(
    dto: GenerateSeoDto,
    res: Response,
  ): Promise<void> {
    try {
      const result = await this.seoService.generate(dto);
      res.status(HttpStatus.OK).json(result);
    } catch (err) {
      this.sendErrorResponse(res, err);
    }
  }

  private async handleStreaming(
    dto: GenerateSeoDto,
    res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const generator = this.seoService.generateStream(dto);

      for await (const event of generator) {
        this.writeSseEvent(res, event);
      }
    } catch (err) {
      const sseError = this.toSseError(err);
      this.writeSseEvent(res, sseError);
    }

    res.end();
  }

  private writeSseEvent(res: Response, event: SseEvent): void {
    res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
  }

  private toSseError(err: unknown): SseEvent {
    if (err instanceof FlowiseError) {
      return {
        event: 'error',
        data: { error: err.message, code: err.code },
      };
    }

    this.logger.error('Unexpected error during streaming', err);
    return {
      event: 'error',
      data: { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    };
  }

  private sendErrorResponse(res: Response, err: unknown): void {
    if (err instanceof FlowiseError) {
      const statusMap: Record<string, HttpStatus> = {
        TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
        EMPTY_RESPONSE: HttpStatus.BAD_GATEWAY,
        INVALID_JSON: HttpStatus.BAD_GATEWAY,
        SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
      };
      const status = statusMap[err.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }

    this.logger.error('Unexpected error', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
}
