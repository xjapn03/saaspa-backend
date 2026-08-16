import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private calendar: any = null;
  private calendarId: string;

  constructor(private config: ConfigService) {
    this.calendarId = config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
  }

  private getClient() {
    if (this.calendar) {
      return this.calendar;
    }

    const clientEmail = this.config.get<string>('GOOGLE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('GOOGLE_PRIVATE_KEY');

    if (!clientEmail || !privateKey) {
      this.logger.warn('Google Calendar no configurado — omitiendo sincronización');
      return null;
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    this.calendar = google.calendar({ version: 'v3', auth });
    return this.calendar;
  }

  async createEvent(booking: {
    id: string;
    startTime: Date;
    endTime: Date;
    status?: string;
    user?: { firstName: string; lastName: string; email: string };
    service?: { name: string; price?: number };
  }): Promise<string | null> {
    const calendar = this.getClient();
    if (!calendar) return null;

    const clientName = booking.user
      ? `${booking.user.firstName} ${booking.user.lastName}`.trim()
      : 'Cliente';
    const serviceName = booking.service?.name || 'Servicio';
    const price = booking.service?.price;

    const description = [
      `Cita #${booking.id}`,
      `Cliente: ${clientName}`,
      `Servicio: ${serviceName}`,
      price !== undefined ? `Precio: $${Number(price).toLocaleString('es-CO')}` : null,
      booking.status ? `Estado: ${booking.status}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const requestBody: any = {
      summary: `${serviceName} — ${clientName}`,
      description,
      start: { dateTime: booking.startTime.toISOString(), timeZone: 'America/Bogota' },
      end: { dateTime: booking.endTime.toISOString(), timeZone: 'America/Bogota' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'email', minutes: 24 * 60 },
        ],
      },
    };

    let lastError: any;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await calendar.events.insert({
          calendarId: this.calendarId,
          requestBody,
        });
        this.logger.log(`Evento creado en Google Calendar: ${res.data.id}`);
        return res.data.id || null;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Intento ${attempt} fallido al crear evento: ${err.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }
    }

    this.logger.error(`Error al crear evento en Google Calendar: ${lastError?.message}`);
    return null;
  }

  async deleteEvent(googleEventId: string): Promise<void> {
    const calendar = this.getClient();
    if (!calendar || !googleEventId) return;

    try {
      await calendar.events.delete({
        calendarId: this.calendarId,
        eventId: googleEventId,
      });
      this.logger.log(`Evento eliminado de Google Calendar: ${googleEventId}`);
    } catch (err: any) {
      this.logger.error(`Error al eliminar evento de Google Calendar: ${err.message}`);
    }
  }

  async updateEvent(
    googleEventId: string,
    booking: {
      startTime: Date;
      endTime: Date;
      user?: { firstName: string; lastName: string };
      service?: { name: string };
    },
  ): Promise<void> {
    const calendar = this.getClient();
    if (!calendar || !googleEventId) return;

    try {
      const clientName = booking.user
        ? `${booking.user.firstName} ${booking.user.lastName}`.trim()
        : 'Cliente';
      const serviceName = booking.service?.name || 'Servicio';

      await calendar.events.patch({
        calendarId: this.calendarId,
        eventId: googleEventId,
        requestBody: {
          summary: `${serviceName} — ${clientName}`,
          description: `Cita reagendada\nCliente: ${clientName}\nServicio: ${serviceName}`,
          start: { dateTime: booking.startTime.toISOString(), timeZone: 'America/Bogota' },
          end: { dateTime: booking.endTime.toISOString(), timeZone: 'America/Bogota' },
        },
      });
      this.logger.log(`Evento actualizado en Google Calendar: ${googleEventId}`);
    } catch (err: any) {
      this.logger.error(`Error al actualizar evento en Google Calendar: ${err.message}`);
    }
  }
}
