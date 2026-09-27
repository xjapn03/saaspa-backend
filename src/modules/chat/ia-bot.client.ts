import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_IA_BOT_TIMEOUT_MS } from './chat.constants';

export interface IaBotLink {
  label: string;
  url: string;
}

export interface IaBotIdentity {
  kind: 'ANONYMOUS' | 'USER';
  userId?: string;
  role?: string;
}

export interface IaBotTurnRequest {
  turnId: string;
  tenantId: string;
  conversationId: string;
  channel: string;
  agent: string;
  identity: IaBotIdentity;
  message: { text: string };
  locale: string;
  timezone: string;
  now: string;
}

export interface IaBotTurnResponse {
  turnId?: string;
  reply?: { text?: string; links?: IaBotLink[] };
  handoff?: { requested?: boolean; reason?: string | null };
  usage?: { model?: string; tokensIn?: number | null; tokensOut?: number | null };
  sources?: unknown[];
}

/**
 * HTTP client for saaspa-IA (POST /api/v1/chat). Uses native fetch, like the Meta
 * CAPI and WhatsApp clients, with an explicit timeout. The upstream response can
 * be RFC 9457 (ProblemDetail) or a plain message, so errors are mapped here and
 * never returned raw to the widget.
 */
@Injectable()
export class IaBotClient {
  private readonly logger = new Logger(IaBotClient.name);

  constructor(private configService: ConfigService) {}

  get baseUrl(): string {
    return this.configService.get<string>('IA_BOT_URL') || 'http://localhost:8000';
  }

  private get timeoutMs(): number {
    const raw = this.configService.get<string>('IA_BOT_TIMEOUT_MS');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IA_BOT_TIMEOUT_MS;
  }

  async chat(request: IaBotTurnRequest, turnToken: string): Promise<IaBotTurnResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.configService.get<string>('IA_BOT_API_KEY') || '',
          Authorization: `Bearer ${turnToken}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const problem = await this.readProblemDetail(response);
        this.logger.warn(`saaspa-IA respondio ${response.status} al turno ${request.turnId}`);
        if (problem.scope === 'tenant') {
          // The tenant cost cap (ADR 0010) was hit: either abuse or a limit that
          // has to be raised. No PII, only the turn and the scope.
          this.logger.warn(
            `saaspa-IA aplico el tope de coste del tenant al turno ${request.turnId}: revisar si hay que subir el limite`,
          );
        }
        throw this.mapError(response.status, problem.detail);
      }

      return (await response.json()) as IaBotTurnResponse;
    } catch (error) {
      // Every mapping below already builds an HttpException; re-throw it instead
      // of wrapping it into a generic 502.
      if (error instanceof HttpException) throw error;
      if ((error as { name?: string })?.name === 'AbortError') {
        this.logger.warn(`saaspa-IA no respondio en ${this.timeoutMs} ms para el turno ${request.turnId}`);
        throw new GatewayTimeoutException('El asistente no respondió a tiempo. Intenta de nuevo.');
      }
      this.logger.error(`Error llamando a saaspa-IA para el turno ${request.turnId}`);
      throw new BadGatewayException('El asistente no está disponible en este momento.');
    } finally {
      clearTimeout(timer);
    }
  }

  private mapError(status: number, detail: string): Error {
    if (status === 400) return new BadRequestException(detail);
    if (status === 429) {
      // The assistant is limiting this turn (cost cap per conversation or per
      // tenant, ADR 0010): it must reach the widget as a real 429, not as a
      // generic 502, so the clienta can wait and retry.
      return new HttpException(
        detail ||
          'Estamos recibiendo muchos mensajes en este momento. Intenta de nuevo en un momento.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (status === 501) return new NotImplementedException(detail);
    return new BadGatewayException(detail || 'El asistente no está disponible en este momento.');
  }

  /**
   * Extracts the text from RFC 9457 (detail/title) or from the Nest default
   * shape, plus the `scope` of a cost-cap rejection (`tenant` | `conversation`,
   * ADR 0010), which is only used to log a signal, never returned to the widget.
   */
  private async readProblemDetail(response: Response): Promise<{ detail: string; scope?: string }> {
    try {
      const body = (await response.json()) as {
        detail?: string;
        title?: string;
        message?: string;
        scope?: string;
      };
      return {
        detail:
          body?.detail || body?.title || (typeof body?.message === 'string' ? body.message : ''),
        scope: typeof body?.scope === 'string' ? body.scope : undefined,
      };
    } catch {
      return { detail: '' };
    }
  }
}
