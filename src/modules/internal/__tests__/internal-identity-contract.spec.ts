import * as fs from 'fs';
import * as path from 'path';
import { Body, Get, Post, Query, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { IsISO8601, IsString } from 'class-validator';
import { getMetadataStorage } from 'class-validator';
import { AvailabilityQueryDto } from '../dto/availability-query.dto';
import { TurnContext } from '../decorators/turn-context.decorator';
import { InternalAvailabilityController } from '../internal-availability.controller';
import { TurnTokenPayload } from '../interfaces/turn-token-payload';

/**
 * ADR 0012 point 1 (identity of the write tools): every internal handler
 * resolves the subject from the turn token. This test fails if a handler takes
 * an identity looking value from the body, the query, the route or a header —
 * the mistake the ADR describes ("crearCita podría tomar el userId del cuerpo
 * porque es más fácil") — and if a handler that receives a body does not read
 * the turn at all.
 *
 * The controllers are discovered from the filesystem on purpose: a new internal
 * controller is checked without touching this file.
 */

/** Names that identify the subject (or its contact data) and must come from the token. */
const IDENTITY_NAMES = new RegExp(
  '^(?:.*_)?(?:user|client|cliente|usuario|owner|subject|sujeto|identity|identidad|' +
    'phone|telefono|email|correo|role|rol|tenant|sessionkeyhash)(?:_?id)?$',
  'i',
);

type RouteParam = { paramtype: string; index: number; data?: unknown };

const paramtypesOf = (target: object, method: string): RouteParam[] => {
  const metadata: Record<string, { index: number; data?: unknown }> =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, method) ?? {};

  return Object.entries(metadata).map(([key, value]) => ({
    paramtype: key.split(':')[0],
    ...value,
  }));
};

/** The paramtype uid of a custom param decorator, so @TurnContext is recognizable. */
const paramtypeOf = (decorator: (...args: never[]) => ParameterDecorator): string => {
  class Probe {
    handler(): void {}
  }
  decorator()(Probe.prototype, 'handler', 0);

  return paramtypesOf(Probe.prototype, 'handler')[0].paramtype;
};

const TURN_CONTEXT_PARAMTYPE = paramtypeOf(TurnContext as never);

/** Property names a DTO declares, read from its class-validator metadata. */
const fieldsOf = (dto: unknown): string[] => {
  if (typeof dto !== 'function') return [];
  return getMetadataStorage()
    .getTargetValidationMetadatas(dto as never, '', false, false)
    .map((metadata) => metadata.propertyName);
};

/** Text of every rule a handler breaks; empty means it is compliant. */
function inspectHandler(controller: Type<unknown>, method: string): string[] {
  const params = paramtypesOf(controller.prototype as object, method);
  const designTypes: unknown[] =
    Reflect.getMetadata('design:paramtypes', controller.prototype as object, method) ?? [];
  const problems: string[] = [];

  const readsTurn = params.some((param) => param.paramtype === TURN_CONTEXT_PARAMTYPE);
  const requestInputs = [
    RouteParamtypes.BODY,
    RouteParamtypes.QUERY,
    RouteParamtypes.PARAM,
    RouteParamtypes.HEADERS,
  ].map(String);

  for (const param of params) {
    if (!requestInputs.includes(param.paramtype)) continue;

    if (typeof param.data === 'string') {
      if (IDENTITY_NAMES.test(param.data)) {
        problems.push(`toma "${param.data}" de la petición en lugar del turn token`);
      }
      continue;
    }

    const declared = Array.isArray(param.data) ? param.data : [];
    const fields = [
      ...fieldsOf(designTypes[param.index]),
      ...declared.filter((value): value is string => typeof value === 'string'),
    ];
    for (const field of fields) {
      if (IDENTITY_NAMES.test(field)) {
        problems.push(`acepta "${field}" en el esquema de la petición`);
      }
    }

    if (fields.length === 0 && param.paramtype === String(RouteParamtypes.BODY)) {
      problems.push(
        'recibe un cuerpo sin esquema validado, así que la regla no se puede comprobar',
      );
    }
  }

  if (params.some((param) => param.paramtype === String(RouteParamtypes.BODY)) && !readsTurn) {
    problems.push('recibe un cuerpo pero no lee el turno con @TurnContext()');
  }

  return problems;
}

/** Every controller exported by the internal module, discovered at runtime. */
function internalControllers(): Type<unknown>[] {
  const directory = path.join(__dirname, '..');
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.controller.ts') || file.endsWith('.controller.js'));

  return files.flatMap((file) => {
    // The discovery is dynamic on purpose, so a new controller is checked here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleExports = require(path.join(directory, file)) as Record<string, unknown>;

    return Object.values(moduleExports).filter(
      (value): value is Type<unknown> =>
        typeof value === 'function' && Reflect.getMetadata(PATH_METADATA, value) !== undefined,
    );
  });
}

/** Handlers of a controller: the methods Nest exposes as routes. */
function handlersOf(controller: Type<unknown>): string[] {
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype).filter(
    (method) =>
      method !== 'constructor' &&
      Reflect.getMetadata(METHOD_METADATA, prototype[method] as object) !== undefined,
  );
}

class IdentityFieldDto {
  @IsString()
  userId: string;
}

class CleanBodyDto {
  @IsISO8601()
  startTime: string;
}

class ProbeBodyByNameController {
  @Post()
  create(@Body('userId') userId: string): { userId: string } {
    return { userId };
  }
}

class ProbeBodySchemaController {
  @Post()
  create(@Body() dto: IdentityFieldDto): IdentityFieldDto {
    return dto;
  }
}

class ProbeQueryController {
  @Get()
  find(@Query('role') role: string): { role: string } {
    return { role };
  }
}

class ProbeBodyWithoutTurnController {
  @Post()
  create(@Body() dto: CleanBodyDto): CleanBodyDto {
    return dto;
  }
}

class ProbeCompliantController {
  @Post()
  create(@TurnContext() turn: TurnTokenPayload, @Body() dto: CleanBodyDto): CleanBodyDto {
    return { ...dto, startTime: `${dto.startTime}:${turn.tenantId}` };
  }
}

describe('Internal identity contract (ADR 0012)', () => {
  describe('the inspector itself', () => {
    it('flags an identity taken from the body by name', () => {
      expect(inspectHandler(ProbeBodyByNameController, 'create')).toEqual(
        expect.arrayContaining([expect.stringContaining('userId')]),
      );
    });

    it('flags an identity field declared in the body schema', () => {
      expect(inspectHandler(ProbeBodySchemaController, 'create')).toEqual(
        expect.arrayContaining([expect.stringContaining('userId')]),
      );
    });

    it('flags an identity taken from the query', () => {
      expect(inspectHandler(ProbeQueryController, 'find')).toEqual(
        expect.arrayContaining([expect.stringContaining('role')]),
      );
    });

    it('flags a handler that receives a body without reading the turn', () => {
      expect(inspectHandler(ProbeBodyWithoutTurnController, 'create')).toEqual(
        expect.arrayContaining([expect.stringContaining('@TurnContext')]),
      );
    });

    it('accepts a handler that resolves the subject from the turn token', () => {
      expect(inspectHandler(ProbeCompliantController, 'create')).toEqual([]);
    });

    it('can read the request schema of a real internal handler', () => {
      const types: unknown[] =
        Reflect.getMetadata(
          'design:paramtypes',
          InternalAvailabilityController.prototype,
          'getAvailability',
        ) ?? [];

      expect(types[0]).toBe(AvailabilityQueryDto);
      expect(fieldsOf(AvailabilityQueryDto)).toEqual(expect.arrayContaining(['serviceId', 'date']));
    });
  });

  describe('the internal controllers', () => {
    const controllers = internalControllers();

    it('discovers every internal controller from the module folder', () => {
      expect(controllers.map((controller) => controller.name).sort()).toEqual([
        'InternalAvailabilityController',
        'InternalServicesController',
      ]);
    });

    for (const controller of controllers) {
      for (const handler of handlersOf(controller)) {
        it(`${controller.name}.${handler} only resolves identity from the turn token`, () => {
          expect(inspectHandler(controller, handler)).toEqual([]);
        });
      }
    }
  });
});
