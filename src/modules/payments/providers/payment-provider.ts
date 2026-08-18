export interface PaymentWidgetConfig {
  publicKey: string;
  reference: string;
  amountInCents: number;
  currency: string;
  signature: string;
}

export interface PaymentIntentParams {
  reference: string;
  amountInCents: number;
  currency: string;
}

export interface NormalizedPaymentEvent {
  eventName: string;
  transactionId: string;
  status: string;
  reference: string;
  amountInCents: string | null;
  timestamp: string;
  checksum: string;
}

export type WebhookParseResult =
  { ok: true; event: NormalizedPaymentEvent } | { ok: false; reason: 'invalid_payload' };

export abstract class IPaymentProvider {
  abstract createPaymentIntent(params: PaymentIntentParams): PaymentWidgetConfig;
  abstract parseWebhook(body: unknown, rawChecksum: string): WebhookParseResult;
  abstract verifyWebhookSignature(event: NormalizedPaymentEvent): boolean;
}
