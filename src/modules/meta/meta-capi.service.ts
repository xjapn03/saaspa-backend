import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export function hashCapiValue(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function hashCapiPhone(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return undefined;
  const normalized = digits.startsWith('57') ? digits : `57${digits}`;
  return hashCapiValue(normalized);
}

export interface MetaCapiEvent {
  eventName: string;
  eventTime?: number;
  eventId?: string;
  actionSource?: string;
  userData?: {
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbc?: string;
    fbp?: string;
    em?: string;
    ph?: string;
  };
  customData?: {
    currency?: string;
    value?: number;
    contentName?: string;
    contentCategory?: string;
    bookingId?: string;
  };
}

@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);
  private readonly pixelId: string;
  private readonly accessToken: string;
  private readonly apiVersion = 'v21.0';

  constructor(private config: ConfigService) {
    this.pixelId = config.get<string>('META_CAPI_PIXEL_ID') || '';
    this.accessToken = config.get<string>('META_CAPI_ACCESS_TOKEN') || '';
  }

  private isConfigured(): boolean {
    if (!this.pixelId || !this.accessToken) {
      this.logger.warn('Meta CAPI no configurado — omitiendo envío de eventos');
      return false;
    }
    return true;
  }

  async sendEvent(event: MetaCapiEvent): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.pixelId}/events?access_token=${this.accessToken}`;

      const payload = {
        data: [
          {
            event_name: event.eventName,
            event_time: event.eventTime || Math.floor(Date.now() / 1000),
            event_id: event.eventId,
            action_source: event.actionSource || 'website',
            user_data: event.userData || {},
            custom_data: event.customData || {},
          },
        ],
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        this.logger.log(`Meta CAPI: ${event.eventName} enviado`);
      } else {
        this.logger.error(`Meta CAPI error: ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      this.logger.error(`Meta CAPI excepción: ${err.message}`);
    }
  }
}
