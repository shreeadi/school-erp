import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { Board, SchoolStatus } from '../../generated/prisma/enums.js';

export class SchoolAdminInputDto {
  @ApiProperty() @IsString() @Length(2, 120) fullName: string;
  @ApiProperty() @IsEmail() @Transform(({ value }) => String(value).trim().toLowerCase()) email: string;
  @ApiPropertyOptional({ description: 'Leave empty to generate a one-time temporary password' })
  @IsOptional() @IsString() @Length(10, 128) password?: string;
}

export class CreateSchoolDto {
  @ApiProperty({ example: 'GREENWOOD' })
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z0-9]{3,16}$/, { message: 'code must be 3-16 letters or digits' })
  code: string;

  @ApiProperty() @IsString() @Length(2, 200) name: string;
  @ApiProperty({ enum: Board }) @IsEnum(Board) board: Board;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) boardName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) state?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() applyBoardTemplate?: boolean;

  @ApiProperty({ type: SchoolAdminInputDto })
  @ValidateNested() @Type(() => SchoolAdminInputDto)
  admin: SchoolAdminInputDto;
}

export class UpdateSchoolStatusDto {
  @ApiProperty({ enum: SchoolStatus }) @IsEnum(SchoolStatus) status: SchoolStatus;
}
