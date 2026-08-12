import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'maria@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Maria' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Gomez' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Cliente frecuente, prefiere masajes relajantes.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Role, default: 'CLIENTE' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
