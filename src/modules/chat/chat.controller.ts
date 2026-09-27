import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ChatService } from './chat.service';
import { UpdateHandoffDto } from './dto/update-handoff.dto';
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

  /**
   * Reversal of the handoff (J-05 / ADR 0013): without it the bot never answers
   * that conversation again. The global AuditInterceptor records who and when.
   */
  @Patch('conversations/:id/handoff')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar o reabrir el handoff de una conversación (Admin/Empleado)' })
  @ApiParam({ name: 'id', description: 'conversationId de la conversación' })
  @ApiResponse({ status: 200, description: 'Estado del handoff actualizado' })
  @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
  updateHandoff(@Param('id') id: string, @Body() dto: UpdateHandoffDto) {
    return this.chatService.setHandoff(id, dto.action);
  }
}
