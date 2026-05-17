import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

interface MulterError extends Error {
  code: string;
  field?: string;
}

function isMulterError(err: unknown): err is MulterError {
  return err instanceof Error && 'code' in err && err.name === 'MulterError';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method: string; url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const body: Record<string, unknown> = { status: 'error' };

    if (isMulterError(exception)) {
      status = HttpStatus.BAD_REQUEST;
      body.message = 'Invalid file upload';
      if (exception.code === 'LIMIT_FILE_SIZE') {
        body.message = 'File too large. Maximum size is 2MB';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        body.message = exResponse;
      } else {
        const resp = exResponse as Record<string, unknown>;
        if (resp.errors && typeof resp.errors === 'object') {
          body.message = 'Validation failed';
          body.errors = resp.errors;
        } else if (Array.isArray(resp.message)) {
          body.message = 'Validation failed';
          const fieldErrors: Record<string, string[]> = {};
          for (const item of resp.message) {
            if (typeof item === 'object' && item !== null) {
              const errItem = item as { field?: string; message?: string };
              const f = errItem.field || '_root';
              if (!fieldErrors[f]) fieldErrors[f] = [];
              fieldErrors[f].push(errItem.message || 'Invalid value');
            }
          }
          body.errors = fieldErrors;
        } else if (typeof resp.message === 'string' && resp.message.includes('Unexpected end of form')) {
          status = HttpStatus.BAD_REQUEST;
          body.message = 'Validation failed';
          body.errors = {
            displayName: ['Display name is required.'],
            bio: ['Bio is required.'],
            whatsapp: ['WhatsApp number is required.'],
            instagram: ['Instagram username is required.'],
            tiktok: ['TikTok username is required.'],
            youtube: ['YouTube channel is required.'],
            website: ['Website URL is required.'],
          };
        } else {
          body.message = resp.message || exception.message;
        }
      }
    } else if (exception instanceof Error) {
      if (exception.message?.includes('Unexpected end of form')) {
        status = HttpStatus.BAD_REQUEST;
        body.message = 'Validation failed';
        body.errors = {
          _root: ['At least one field must be provided. Available: displayName, avatarUrl, bio, whatsapp, instagram, tiktok, youtube, website'],
        };
      } else {
        body.message = exception.message;
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const isSocketIo = request.url?.startsWith('/socket.io/');
    if (!isSocketIo || status !== HttpStatus.NOT_FOUND) {
      this.logger.error(`${request.method} ${request.url} ${status} - ${body.message}`);
    }

    response.status(status).json(body);
  }
}
