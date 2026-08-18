import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarService } from '../google-calendar.service';
import { google as mockGoogle } from './__mocks__/googleapis';

const mockCalendarClient = mockGoogle.calendar() as any;

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;

  const mockBooking = {
    id: 'booking-1',
    startTime: new Date('2026-08-15T10:00:00-05:00'),
    endTime: new Date('2026-08-15T11:00:00-05:00'),
    user: { firstName: 'Maria', lastName: 'Gomez', email: 'maria@test.com', phone: '3001234567' },
    service: { name: 'Facial' },
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('with credentials configured', () => {
    beforeEach(async () => {
      (mockGoogle.auth.JWT as jest.Mock).mockImplementation((opts: any) => opts);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoogleCalendarService,
          {
            provide: ConfigService,
            useValue: new ConfigService({
              GOOGLE_CLIENT_EMAIL: 'calendar@kamerinos.iam.gserviceaccount.com',
              GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nfake-key\n-----END PRIVATE KEY-----\n',
              GOOGLE_CALENDAR_ID: 'primary',
            }),
          },
        ],
      }).compile();

      service = module.get<GoogleCalendarService>(GoogleCalendarService);
    });

    describe('createEvent', () => {
      it('should call calendar.events.insert and return event id', async () => {
        mockCalendarClient.events.insert.mockResolvedValue({ data: { id: 'evt-123' } });

        const eventId = await service.createEvent(mockBooking);

        expect(eventId).toBe('evt-123');
        expect(mockCalendarClient.events.insert).toHaveBeenCalledTimes(1);
        const insertArgs = mockCalendarClient.events.insert.mock.calls[0][0];
        expect(insertArgs.calendarId).toBe('primary');
        expect(insertArgs.requestBody.summary).toBe('Facial — Maria Gomez');
        expect(insertArgs.requestBody.start.dateTime).toBe(mockBooking.startTime.toISOString());
        expect(insertArgs.requestBody.end.dateTime).toBe(mockBooking.endTime.toISOString());
        // Las cuentas de servicio no pueden invitar asistentes sin Domain-Wide Delegation:
        // el evento se crea SIN attendees ni sendNotifications (el cliente se avisa por SendGrid).
        expect(insertArgs).not.toHaveProperty('attendees');
        expect(insertArgs).not.toHaveProperty('sendNotifications');
        expect(insertArgs.requestBody).not.toHaveProperty('attendees');
      });

      it('should handle null user gracefully', async () => {
        mockCalendarClient.events.insert.mockResolvedValue({ data: { id: 'evt-456' } });

        const eventId = await service.createEvent({
          id: 'booking-2',
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
          service: { name: 'Facial' },
        });

        expect(eventId).toBe('evt-456');
        expect(mockCalendarClient.events.insert).toHaveBeenCalledTimes(1);
        expect(mockCalendarClient.events.insert.mock.calls[0][0].requestBody.summary).toBe('Facial — Cliente');
      });

      it('should handle null service gracefully', async () => {
        mockCalendarClient.events.insert.mockResolvedValue({ data: { id: 'evt-789' } });

        const eventId = await service.createEvent({
          id: 'booking-3',
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
        });

        expect(eventId).toBe('evt-789');
        expect(mockCalendarClient.events.insert).toHaveBeenCalledTimes(1);
        expect(mockCalendarClient.events.insert.mock.calls[0][0].requestBody.summary).toBe('Servicio — Cliente');
      });

      it('should return null on Google API error', async () => {
        mockCalendarClient.events.insert.mockRejectedValue(new Error('API error'));

        const eventId = await service.createEvent(mockBooking);

        expect(eventId).toBeNull();
      });
    });

    describe('deleteEvent', () => {
      it('should call calendar.events.delete', async () => {
        mockCalendarClient.events.delete.mockResolvedValue({});

        await service.deleteEvent('evt-123');

        expect(mockCalendarClient.events.delete).toHaveBeenCalledTimes(1);
        expect(mockCalendarClient.events.delete.mock.calls[0][0]).toMatchObject({
          calendarId: 'primary',
          eventId: 'evt-123',
        });
      });

      it('should not throw on Google API error', async () => {
        mockCalendarClient.events.delete.mockRejectedValue(new Error('API error'));

        await expect(service.deleteEvent('evt-123')).resolves.toBeUndefined();
      });

      it('should not call API when googleEventId is empty', async () => {
        await service.deleteEvent('');
        expect(mockCalendarClient.events.delete).not.toHaveBeenCalled();
      });
    });

    describe('updateEvent', () => {
      it('should call calendar.events.patch with updated data', async () => {
        mockCalendarClient.events.patch.mockResolvedValue({});

        await service.updateEvent('evt-123', {
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
          user: mockBooking.user,
          service: mockBooking.service,
        });

        expect(mockCalendarClient.events.patch).toHaveBeenCalledTimes(1);
        const patchArgs = mockCalendarClient.events.patch.mock.calls[0][0];
        expect(patchArgs.calendarId).toBe('primary');
        expect(patchArgs.eventId).toBe('evt-123');
        expect(patchArgs.requestBody.summary).toBe('Facial — Maria Gomez');
      });

      it('should not throw on Google API error', async () => {
        mockCalendarClient.events.patch.mockRejectedValue(new Error('API error'));

        await expect(
          service.updateEvent('evt-123', {
            startTime: mockBooking.startTime,
            endTime: mockBooking.endTime,
          }),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('without credentials', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoogleCalendarService,
          {
            provide: ConfigService,
            useValue: new ConfigService({
              GOOGLE_CLIENT_EMAIL: '',
              GOOGLE_PRIVATE_KEY: '',
              GOOGLE_CALENDAR_ID: 'primary',
            }),
          },
        ],
      }).compile();

      service = module.get<GoogleCalendarService>(GoogleCalendarService);
    });

    it('should return null on createEvent without credentials', async () => {
      const eventId = await service.createEvent(mockBooking);
      expect(eventId).toBeNull();
    });

    it('should not throw on deleteEvent without credentials', async () => {
      await expect(service.deleteEvent('evt-123')).resolves.toBeUndefined();
    });

    it('should not throw on updateEvent without credentials', async () => {
      await expect(
        service.updateEvent('evt-123', {
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
