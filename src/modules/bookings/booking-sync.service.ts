import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { IBookingsRepository, IBookingSafe } from '../../repositories/interfaces/bookings.repository';
import { GoogleCalendarService } from '../../common/google-calendar/google-calendar.service';
import { MetaCapiService } from '../../modules/meta/meta-capi.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class BookingSyncService {
  private readonly logger = new Logger(BookingSyncService.name);

  constructor(
    private bookingsRepo: IBookingsRepository,
    private calendar: GoogleCalendarService,
    private metaCapi: MetaCapiService,
    private redis: RedisService,
  ) {}

  async confirmAndSync(id: string): Promise<IBookingSafe> {
    const booking = await this.bookingsRepo.findById(id);

    if (['CANCELADA', 'COMPLETADA', 'NO_ASISTIO'].includes(booking.status)) {
      throw new BadRequestException('No se puede confirmar una cita cancelada, completada o no asistida');
    }

    this.releaseSlotLock(booking.startTime);

    if (booking.status !== 'CONFIRMADA') {
      await this.bookingsRepo.update(id, { status: 'CONFIRMADA' } as any);
    }

    if (!booking.googleEventId) {
      const googleEventId = await this.calendar.createEvent({
        id: booking.id,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        status: 'CONFIRMADA',
        user: booking.user as any,
        service: booking.service as any,
      });

      if (googleEventId) {
        await this.bookingsRepo.update(id, { googleEventId, calendarSync: 'SYNCED' } as any);
      } else {
        await this.bookingsRepo.update(id, { calendarSync: 'FAILED' } as any);
        this.logger.warn(`No se pudo sincronizar el calendario para la cita ${id}`);
      }
    }

    this.metaCapi.sendEvent({
      eventName: 'Schedule',
      customData: {
        currency: 'COP',
        value: (booking.service as any)?.price ? Number((booking.service as any).price) : undefined,
        contentName: (booking.service as any)?.name,
        bookingId: booking.id,
      },
    });

    return this.bookingsRepo.findById(id);
  }

  async syncPending(): Promise<{ synced: number; failed: number }> {
    const pending = await this.bookingsRepo.findPendingCalendarSync();
    let synced = 0;
    let failed = 0;

    for (const booking of pending) {
      const googleEventId = await this.calendar.createEvent({
        id: booking.id,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        status: booking.status,
        user: booking.user as any,
        service: booking.service as any,
      });

      if (googleEventId) {
        await this.bookingsRepo.update(booking.id, { googleEventId, calendarSync: 'SYNCED' } as any);
        synced++;
      } else {
        await this.bookingsRepo.update(booking.id, { calendarSync: 'FAILED' } as any);
        failed++;
      }
    }

    this.logger.log(`Sync de calendario: ${synced} sincronizadas, ${failed} fallidas`);
    return { synced, failed };
  }

  private releaseSlotLock(startTime: Date): void {
    const dateKey = new Date(startTime).toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${new Date(startTime).toISOString()}`;
    this.redis.del(lockKey).catch(() => {});
  }
}
