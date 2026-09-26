import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternalModule } from '../internal/internal.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { IaBotClient } from './ia-bot.client';

/**
 * Public web chat gateway: resolves identity, issues the turn token, calls
 * saaspa-IA and keeps the per-conversation handoff state (A-10a).
 */
@Module({
  imports: [AuthModule, InternalModule],
  controllers: [ChatController],
  providers: [ChatService, IaBotClient],
})
export class ChatModule {}
