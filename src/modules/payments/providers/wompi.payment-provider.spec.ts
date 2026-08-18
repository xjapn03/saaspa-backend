import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WompiPaymentProvider } from './wompi.payment-provider';

describe('WompiPaymentProvider', () => {
  let provider: WompiPaymentProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WompiPaymentProvider,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            WOMPI_PUBLIC_KEY: 'pub_test_test123',
            WOMPI_INTEGRITY_SECRET: 'integ_test_test123',
            WOMPI_EVENTS_KEY: 'events_test_test123',
          }),
        },
      ],
    }).compile();
    provider = module.get<WompiPaymentProvider>(WompiPaymentProvider);
  });

  describe('createPaymentIntent', () => {
    it('should return widget config with sha256 integrity signature', () => {
      const result = provider.createPaymentIntent({
        reference: 'ref-1',
        amountInCents: 50000,
        currency: 'COP',
      });

      expect(result.publicKey).toBe('pub_test_test123');
      expect(result.reference).toBe('ref-1');
      expect(result.amountInCents).toBe(50000);
      expect(result.currency).toBe('COP');
      expect(result.signature).toHaveLength(64);
      expect(result.signature).toMatch(/^[a-f0-9]+$/);
    });

    it('should use the configured integrity secret in the signature', () => {
      const result = provider.createPaymentIntent({
        reference: 'ref-1',
        amountInCents: 50000,
        currency: 'COP',
      });

      const expected = crypto
        .createHash('sha256')
        .update(`ref-150000COPinteg_test_test123`)
        .digest('hex');
      expect(result.signature).toBe(expected);
    });
  });

  describe('parseWebhook', () => {
    it('should normalize a valid Wompi payload', () => {
      const result = provider.parseWebhook(
        {
          event: 'transaction.updated',
          data: {
            transaction: {
              id: 'txn-1',
              status: 'APPROVED',
              reference: 'ref-1',
              amount_in_cents: 50000,
            },
          },
          timestamp: '1754912000',
        },
        'checksum-abc',
      );

      expect(result).toEqual({
        ok: true,
        event: {
          eventName: 'transaction.updated',
          transactionId: 'txn-1',
          status: 'APPROVED',
          reference: 'ref-1',
          amountInCents: '50000',
          timestamp: '1754912000',
          checksum: 'checksum-abc',
        },
      });
    });

    it('should fall back to body.signature.checksum when no header is sent', () => {
      const result = provider.parseWebhook(
        {
          event: 'transaction.updated',
          data: { transaction: { id: 'txn-1', status: 'APPROVED' } },
          timestamp: '1754912000',
          signature: { checksum: 'checksum-from-body' },
        },
        '',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event.checksum).toBe('checksum-from-body');
      }
    });

    it('should return invalid_payload when required fields are missing', () => {
      expect(provider.parseWebhook({}, 'checksum')).toEqual({
        ok: false,
        reason: 'invalid_payload',
      });
      expect(provider.parseWebhook({ event: 'transaction.updated' }, 'checksum')).toEqual({
        ok: false,
        reason: 'invalid_payload',
      });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for a correctly computed checksum', () => {
      const timestamp = '1754912000';
      const data = `txn-1APPROVED50000${timestamp}events_test_test123`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      const valid = provider.verifyWebhookSignature({
        eventName: 'transaction.updated',
        transactionId: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-1',
        amountInCents: '50000',
        timestamp,
        checksum,
      });
      expect(valid).toBe(true);
    });

    it('should return false for a wrong checksum', () => {
      const valid = provider.verifyWebhookSignature({
        eventName: 'transaction.updated',
        transactionId: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-1',
        amountInCents: '50000',
        timestamp: '1754912000',
        checksum: 'badchecksum',
      });
      expect(valid).toBe(false);
    });
  });
});
