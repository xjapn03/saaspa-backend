import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaCapiService } from '../meta-capi.service';

describe('MetaCapiService', () => {
  let service: MetaCapiService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    } as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('with credentials configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          {
            provide: ConfigService,
            useValue: new ConfigService({
              META_CAPI_PIXEL_ID: '1234567890',
              META_CAPI_ACCESS_TOKEN: 'test-token',
            }),
          },
        ],
      }).compile();

      service = module.get<MetaCapiService>(MetaCapiService);
    });

    it('should send a Schedule event to Meta CAPI', async () => {
      await service.sendEvent({
        eventName: 'Schedule',
        customData: {
          currency: 'COP',
          value: 100000,
          contentName: 'Facial',
          bookingId: 'booking-1',
        },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('graph.facebook.com/v18.0/1234567890/events');
      expect(url).toContain('access_token=test-token');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.data[0].event_name).toBe('Schedule');
      expect(body.data[0].action_source).toBe('website');
      expect(body.data[0].custom_data.currency).toBe('COP');
      expect(body.data[0].custom_data.value).toBe(100000);
    });

    it('should send a Purchase event', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ events_received: 1 }) } as any);

      await service.sendEvent({
        eventName: 'Purchase',
        customData: {
          value: 30000,
          contentName: 'Masaje',
          bookingId: 'booking-2',
        },
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.data[0].event_name).toBe('Purchase');
      expect(body.data[0].custom_data.value).toBe(30000);
    });

    it('should include userData when provided', async () => {
      await service.sendEvent({
        eventName: 'Lead',
        userData: {
          clientIpAddress: '127.0.0.1',
          clientUserAgent: 'test-agent',
          fbc: 'fb.1.test',
        },
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.data[0].user_data.clientIpAddress).toBe('127.0.0.1');
      expect(body.data[0].user_data.fbc).toBe('fb.1.test');
    });

    it('should handle API error gracefully', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'Invalid parameter' } }),
      } as any);

      await expect(
        service.sendEvent({ eventName: 'Test' }),
      ).resolves.toBeUndefined();
    });

    it('should handle network error gracefully', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      await expect(
        service.sendEvent({ eventName: 'Test' }),
      ).resolves.toBeUndefined();
    });

    it('should use provided eventTime', async () => {
      const pastTime = 1609459200;

      await service.sendEvent({
        eventName: 'Schedule',
        eventTime: pastTime,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.data[0].event_time).toBe(pastTime);
    });
  });

  describe('without credentials', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          {
            provide: ConfigService,
            useValue: new ConfigService({
              META_CAPI_PIXEL_ID: '',
              META_CAPI_ACCESS_TOKEN: '',
            }),
          },
        ],
      }).compile();

      service = module.get<MetaCapiService>(MetaCapiService);
    });

    it('should not call fetch when credentials are empty', async () => {
      await service.sendEvent({ eventName: 'Schedule' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
