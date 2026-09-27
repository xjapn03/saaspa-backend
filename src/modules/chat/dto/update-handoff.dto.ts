import { IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of PATCH /api/chat/conversations/:id/handoff (ADR 0013).
 * `close` ends the handoff (a person already attended the clienta, so the bot
 * answers again); `reopen` hands the conversation back to a person.
 */
export class UpdateHandoffDto {
  @ApiProperty({ enum: ['close', 'reopen'], example: 'close' })
  @IsNotEmpty()
  @IsIn(['close', 'reopen'])
  action: 'close' | 'reopen';
}
