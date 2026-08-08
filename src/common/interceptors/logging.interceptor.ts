import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse<Response>();
          const duration = Date.now() - start;
          this.logger.log(`${method} ${originalUrl} ${res.statusCode} ${duration}ms - ${ip}`);
        },
        error: (err: any) => {
          const duration = Date.now() - start;
          this.logger.warn(`${method} ${originalUrl} ${err?.status || 500} ${duration}ms - ${ip}`);
        },
      }),
    );
  }
}
