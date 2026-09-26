import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
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
        const detail = await this.readProblemDetail(response);
        this.logger.warn(`saaspa-IA respondio ${response.status} al turno ${request.turnId}`);
        throw this.mapError(response.status, detail);
      }

      return (await response.json()) as IaBotTurnResponse;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotImplementedException || error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }
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
    if (status === 501) return new NotImplementedException(detail);
    return new BadGatewayException(detail || 'El asistente no está disponible en este momento.');
  }

  /** Extracts text from RFC 9457 (detail/title) or from the Nest default shape. */
  private async readProblemDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: string; title?: string; message?: string };
      return body?.detail || body?.title || (typeof body?.message === 'string' ? body.message : '');
    } catch {
      return '';
    }
  }
}
