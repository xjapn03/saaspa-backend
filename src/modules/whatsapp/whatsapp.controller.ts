import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get('webhook')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Verificación del webhook de WhatsApp Cloud API (GET)' })
  @ApiQuery({ name: 'hub.mode', required: false })
  @ApiQuery({ name: 'hub.verify_token', required: false })
  @ApiQuery({ name: 'hub.challenge', required: false })
  verify(@Req() req: Request, @Res() res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const challengeValue = Array.isArray(challenge) ? challenge[0] : challenge;

    if (this.whatsappService.verifySubscription(mode, token)) {
      return res.status(200).send(challengeValue ?? '');
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Recepción de eventos y mensajes de WhatsApp Cloud API (POST)' })
  receive(@Req() req: Request, @Res() res: Response) {
    this.whatsappService.handleIncoming(req.body);
    return res.sendStatus(200);
  }
}
