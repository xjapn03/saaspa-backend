import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { pickProblemExtensions } from '../http/problem-extensions';

/**
 * Short phrase per status. With `type: about:blank` (no type registry yet) RFC
 * 9457 expects `title` to describe the status, so the clienta-facing detail stays
 * free to carry the specific message.
 */
const TITLES: Record<number, string> = {
  400: 'Solicitud incorrecta',
  401: 'No autenticado',
  403: 'No autorizado',
  404: 'No encontrado',
  409: 'Conflicto',
  413: 'Contenido demasiado grande',
  422: 'Entidad no procesable',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  501: 'No implementado',
  502: 'Pasarela incorrecta',
  503: 'Servicio no disponible',
  504: 'Tiempo de espera agotado',
};

/**
 * RFC 9457 (`application/problem+json`) for the chat endpoints, the only ones
 * whose contracts describe that format (J-07). The rest of the API keeps the
 * Nest default `{ statusCode, message, error }`.
 *
 * The IA's `detail` becomes `detail` (it used to be returned as `message`) and
 * the cost cap extensions travel with it. A non-HttpException becomes a 500 with
 * a generic `detail`: the internal message and the stack stay in the logs.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? (exception as HttpException).getResponse() : undefined;
    const source = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);

    if (!isHttp) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: TITLES[status] || 'Error',
        status,
        detail: this.detailOf(source),
        instance: request.url,
        ...pickProblemExtensions(source),
      });
  }

  /** RFC 9457 `detail` is text; ValidationPipe reports an array of messages. */
  private detailOf(source: Record<string, unknown> | undefined): string {
    const message = source?.message ?? source?.error;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string' && message.length > 0) return message;
    return 'La solicitud no se pudo procesar';
  }
}
