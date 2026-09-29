import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  ProblemDetailsFilter,
  THROTTLER_DETAIL,
  VALIDATION_DETAIL,
} from '../problem-details.filter';

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;

  const host = (url = '/api/chat') => {
    const json = jest.fn();
    const type = jest.fn().mockReturnValue({ json });
    const status = jest.fn().mockReturnValue({ type });
    const argumentsHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url }),
      }),
    } as unknown as ArgumentsHost;

    return { argumentsHost, status, type, json };
  };

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
  });

  it('turns an HttpException into an RFC 9457 problem document', () => {
    const { argumentsHost, status, type, json } = host();

    filter.catch(new BadRequestException('tenantId no coincide'), argumentsHost);

    expect(status).toHaveBeenCalledWith(400);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(json).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Solicitud incorrecta',
      status: 400,
      detail: 'tenantId no coincide',
      instance: '/api/chat',
    });
  });

  it('keeps the cost cap extensions of a 429 (J-07)', () => {
    const { argumentsHost, json } = host();
    const exception = new HttpException(
      {
        statusCode: 429,
        message: 'Tope de coste superado: tokens (12000 de 10000 en PT1H)',
        scope: 'tenant',
        measure: 'tokens',
        measured: 12000,
        limit: 10000,
        window: 'PT1H',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, argumentsHost);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Demasiadas solicitudes',
        status: 429,
        detail: 'Tope de coste superado: tokens (12000 de 10000 en PT1H)',
        scope: 'tenant',
        measure: 'tokens',
        measured: 12000,
        limit: 10000,
        window: 'PT1H',
      }),
    );
  });

  it('replaces the raw validation messages with a fixed Spanish detail (R-07.a)', () => {
    const { argumentsHost, json } = host();
    jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined);
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['message.text should not be empty', 'message.text must be a string'],
      error: 'Bad Request',
    });

    filter.catch(exception, argumentsHost);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Solicitud incorrecta',
        status: 400,
        detail: VALIDATION_DETAIL,
      }),
    );
    // class-validator's English never reaches the clienta...
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('should not be empty');
    // ...but the technical reason is logged (R-07.a).
    expect((filter as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('message.text should not be empty; message.text must be a string'),
    );
  });

  it('replaces the throttler jargon with a fixed Spanish detail (R-07.a)', () => {
    const { argumentsHost, json } = host();

    // The message is the literal of @nestjs/throttler 6.5.0, raw by design.
    filter.catch(new ThrottlerException(), argumentsHost);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Demasiadas solicitudes',
        status: 429,
        detail: THROTTLER_DETAIL,
      }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('ThrottlerException');
  });

  it('keeps the message and the title of any status', () => {
    const { argumentsHost, json } = host();

    filter.catch(new ForbiddenException('La conversación no pertenece a esta sesión'), argumentsHost);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No autorizado',
        status: 403,
        detail: 'La conversación no pertenece a esta sesión',
      }),
    );
  });

  it('does not leak an unexpected error: 500 with a generic detail', () => {
    const { argumentsHost, json } = host();
    jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);

    filter.catch(new Error('conexion a la base de datos caida'), argumentsHost);

    const body = json.mock.calls[0][0];
    expect(body.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.title).toBe('Error interno');
    expect(body.detail).toBe('La solicitud no se pudo procesar');
    expect(JSON.stringify(body)).not.toContain('conexion a la base de datos caida');
  });
});
