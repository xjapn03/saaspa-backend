import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TurnRequest } from '../guards/internal-auth.guard';
import { TurnTokenPayload } from '../interfaces/turn-token-payload';

/**
 * Reads the verified turn token attached to the request by InternalAuthGuard.
 * Usage: `@TurnContext() turn: TurnTokenPayload` or `@TurnContext('conversationId') id: string`.
 */
export const TurnContext = createParamDecorator(
  (data: keyof TurnTokenPayload | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<TurnRequest>();
    const turn = request.turn;
    return data ? turn?.[data] : turn;
  },
);
