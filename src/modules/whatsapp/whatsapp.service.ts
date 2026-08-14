import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

const GRAPH_API_VERSION = 'v18.0';
const FRONTEND_DEFAULT_URL = 'https://kamerinos.sandrapinzonsaludybelleza.com.co';

export interface IncomingMessageValue {
  phoneNumberId?: string;
  waId?: string;
  text?: string;
  buttonReplyId?: string;
  referral?: { source?: string; ctwaClid?: string };
  raw: unknown;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly verifyToken: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly frontendUrl: string;

  constructor(private config: ConfigService, private prisma: PrismaService) {
    this.verifyToken = this.config.get<string>('meta.whatsappVerifyToken') || '';
    this.phoneNumberId = this.config.get<string>('meta.whatsappPhoneNumberId') || '';
    this.accessToken = this.config.get<string>('meta.whatsappAccessToken') || '';
    this.frontendUrl = this.config.get<string>('frontend.url') || FRONTEND_DEFAULT_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  verifySubscription(mode: unknown, token: unknown): boolean {
    if (!this.verifyToken) return false;
    return mode === 'subscribe' && token === this.verifyToken;
  }

  parseIncomingMessage(body: any): IncomingMessageValue | null {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return null;

    const message = value.messages?.[0];
    return {
      phoneNumberId: value.metadata?.phone_number_id,
      waId: value.contacts?.[0]?.wa_id,
      text: message?.text?.body,
      buttonReplyId: message?.interactive?.button_reply?.id,
      referral: value.referral
        ? { source: value.referral.source, ctwaClid: value.referral.ctwa_clid }
        : undefined,
      raw: value,
    };
  }

  async handleIncoming(body: any): Promise<void> {
    try {
      if (!this.isConfigured()) {
        this.logger.warn('WhatsApp no configurado — omitiendo evento entrante');
        return;
      }

      const incoming = this.parseIncomingMessage(body);
      if (!incoming?.waId) return;

      const waId = incoming.waId;
      const existing = await this.prisma.conversationState.findUnique({ where: { waId } });
      const state: any = (existing?.state as any) || {};

      if (!existing) {
        const initialState: any = {
          greeted: true,
          firstSeen: new Date().toISOString(),
        };
        if (incoming.referral?.ctwaClid) {
          initialState.ctwaClid = incoming.referral.ctwaClid;
        }
        await this.prisma.conversationState.create({ data: { waId, state: initialState } });
        await this.sendWelcomeMenu(waId);
        return;
      }

      if (incoming.buttonReplyId) {
        await this.handleButtonReply(waId, incoming.buttonReplyId);
        return;
      }

      if (incoming.text && !state.handoffSent) {
        await this.sendText(
          waId,
          'Gracias por escribirnos. Un asesor de Kamerinos te responderá muy pronto.',
        );
        await this.prisma.conversationState.update({
          where: { waId },
          data: { state: { ...state, handoffSent: true } },
        });
      }
    } catch (err: any) {
      this.logger.error(`WhatsApp handleIncoming excepción: ${err?.message || err}`);
    }
  }

  private async handleButtonReply(waId: string, buttonId: string): Promise<void> {
    switch (buttonId) {
      case 'AGENDAR':
        await this.sendText(
          waId,
          `Para agendar tu cita ingresa aquí: ${this.frontendUrl}/agendar\n\nLas citas se confirman con un abono del 30% a través de nuestra pasarela de pago.`,
        );
        break;
      case 'SERVICIOS':
        await this.sendText(
          waId,
          `Conoce todos nuestros servicios aquí: ${this.frontendUrl}/servicios`,
        );
        break;
      case 'SHOP':
        await this.sendText(
          waId,
          `Visita nuestra tienda y descubre nuestros productos: ${this.frontendUrl}/shop`,
        );
        break;
      default:
        await this.sendText(waId, 'Elige una de las opciones del menú para poder ayudarte mejor.');
    }
  }

  private async sendText(to: string, body: string): Promise<void> {
    await this.sendMessage(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body },
    });
  }

  async sendWelcomeMenu(to: string): Promise<void> {
    await this.sendMessage(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: 'Kamerinos SPA' },
        body: {
          text:
            'Hola, bienvenida a Kamerinos SPA.\n\nPodemos ayudarte a agendar tu cita, conocer nuestros servicios o comprar nuestros productos. Elige una opción:',
        },
        footer: { text: 'Estamos para cuidar de ti' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'AGENDAR', title: 'Agendar cita' } },
            { type: 'reply', reply: { id: 'SERVICIOS', title: 'Ver servicios' } },
            { type: 'reply', reply: { id: 'SHOP', title: 'Comprar' } },
          ],
        },
      },
    });
  }

  private async sendMessage(to: string, payload: unknown): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        this.logger.error(`WhatsApp send error: ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      this.logger.error(`WhatsApp send excepción: ${err?.message || err}`);
    }
  }
}
