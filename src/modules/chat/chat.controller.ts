import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ChatService } from './chat.service';
import { WebChatRequestDto } from './dto/web-chat-request.dto';

/**
 * Public entry point of the web chat (anonymous widget and logged in client).
 * The frontend always talks to this endpoint, never to saaspa-IA.
 *
 * Contract: saaspa-IA/docs/contracts/web-chat-api.openapi.yaml.
 * Anti-abuse: 20 requests per minute per IP plus a per-session message cap and a
 * maximum message length, both enforced in ChatService.
 */
@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Procesa un turno del chat web (anónimo o logueado)' })
  @ApiResponse({ status: 200, description: 'Respuesta del agente' })
  @ApiResponse({ status: 400, description: 'Cuerpo inválido' })
  @ApiResponse({ status: 413, description: 'Mensaje demasiado largo' })
  @ApiResponse({ status: 429, description: 'Límite de tasa o de mensajes de la sesión' })
  webChat(
    @Body() dto: WebChatRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.chatService.handle(dto, request, response);
  }
}
