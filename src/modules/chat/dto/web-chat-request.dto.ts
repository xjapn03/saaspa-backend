import { Type } from 'class-transformer';
import { IsOptional, IsString, IsNotEmpty, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebChatMessageDto {
  @ApiProperty({ example: 'Hola, cuánto cuesta un facial?', description: 'Texto del mensaje (máximo 1000 caracteres)' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

/**
 * Body of POST /api/chat. The client only sends the message and, after the first
 * turn, the conversationId: tenant, channel, agent, role and identity are always
 * resolved by the backend. Unknown fields are rejected by the global ValidationPipe.
 */
export class WebChatRequestDto {
  @ApiPropertyOptional({ example: '3f1a1f6e5b1c4a5e9a0e1b2c3d4e5f60', description: 'Ausente en el primer turno' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;

  @ApiProperty({ type: WebChatMessageDto })
  @ValidateNested()
  @Type(() => WebChatMessageDto)
  message: WebChatMessageDto;
}
