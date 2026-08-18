import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  PaymentWidgetConfig,
  PaymentIntentParams,
  NormalizedPaymentEvent,
  WebhookParseResult,
} from './payment-provider';

@Injectable()
export class WompiPaymentProvider extends IPaymentProvider {
  constructor(private config: ConfigService) {
    super();
  }

  createPaymentIntent({
    reference,
    amountInCents,
    currency,
  }: PaymentIntentParams): PaymentWidgetConfig {
    const publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') || 'pub_test_xxx';
    const secret = this.config.get<string>('WOMPI_INTEGRITY_SECRET') || 'integ_test_xxx';
    const data = `${reference}${amountInCents}${currency}${secret}`;
    const signature = crypto.createHash('sha256').update(data).digest('hex');
    return { publicKey, reference, amountInCents, currency, signature };
  }

  parseWebhook(body: any, rawChecksum: string): WebhookParseResult {
    const eventName = body?.event;
    const data = body?.data?.transaction;
    const timestamp = body?.timestamp?.toString();
    const checksum = rawChecksum || body?.signature?.checksum;

    if (!data || !timestamp || !checksum) {
      return { ok: false, reason: 'invalid_payload' };
    }

    return {
      ok: true,
      event: {
        eventName,
        transactionId: data.id,
        status: data.status,
        reference: data.reference,
        amountInCents: data.amount_in_cents ? data.amount_in_cents.toString() : null,
        timestamp,
        checksum,
      },
    };
  }

  verifyWebhookSignature(event: NormalizedPaymentEvent): boolean {
    const secret = this.config.get<string>('WOMPI_EVENTS_KEY') || 'events_test_xxx';
    const data = `${event.transactionId}${event.status}${event.amountInCents ?? ''}${event.timestamp}${secret}`;
    const computed = crypto.createHash('sha256').update(data).digest('hex');
    return computed.toUpperCase() === event.checksum.toUpperCase();
  }
}
