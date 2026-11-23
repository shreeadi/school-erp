import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { Gender, GuardianRelationship, StudentStatus } from '../../generated/prisma/enums.js';

const PHONE = /^\+?[0-9]{10,15}$/;

export class NewGuardianDto {
  @ApiProperty() @IsString() @Length(2, 120) fullName: string;
  @ApiProperty({ example: '+919876543210' }) @Matches(PHONE) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @Transform(({ value }) => (value ? String(value).trim().toLowerCase() : value)) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) occupation?: string;
}

export class GuardianLinkDto {
  @ApiPropertyOptional({ description: 'Link an existing guardian (e.g. a sibling\'s parent)' })
  @IsOptional() @IsUUID() guardianId?: string;

  @ApiPropertyOptional({ type: NewGuardianDto, description: 'Or create a new guardian' })
  @ValidateIf((o) => !o.guardianId) @ValidateNested() @Type(() => NewGuardianDto) guardian?: NewGuardianDto;

  @ApiProperty({ enum: GuardianRelationship }) @IsEnum(GuardianRelationship) relationship: GuardianRelationship;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() canPickup?: boolean;
}

class StudentFields {
  @ApiProperty() @IsString() @Length(1, 80) firstName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) lastName?: string;
  @ApiProperty({ example: '2014-06-15' }) @IsDateString() dateOfBirth: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender) gender: Gender;
  @ApiPropertyOptional({ example: 'B+' }) @IsOptional() @Matches(/^(A|B|AB|O)[+-]$/) bloodGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) state?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[0-9]{6}$/) postalCode?: string;
}

export class AdmitStudentDto extends StudentFields {
  @ApiPropertyOptional({ description: 'Leave empty to auto-generate from the school prefix' })
  @IsOptional() @Matches(/^[A-Za-z0-9/-]{2,30}$/) admissionNumber?: string;
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Defaults to today' }) @IsOptional() @IsDateString() admissionDate?: string;
  @ApiProperty({ description: 'Section to enrol into (its academic year is used)' }) @IsUUID() sectionId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(999) rollNumber?: number;
  @ApiPropertyOptional({ type: [GuardianLinkDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuardianLinkDto) guardians?: GuardianLinkDto[];
}

export class UpdateStudentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @Matches(/^(A|B|AB|O)[+-]$/) bloodGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) state?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[0-9]{6}$/) postalCode?: string;
  @ApiPropertyOptional({ enum: StudentStatus, description: 'TRANSFERRED / WITHDRAWN also closes the active enrollment' })
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
}

export class EnrollDto {
  @ApiProperty() @IsUUID() sectionId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(999) rollNumber?: number;
}

export class CreateAccountDto {
  @ApiProperty() @IsEmail() @Transform(({ value }) => String(value).trim().toLowerCase()) email: string;
}

export class CreateGuardianDto extends NewGuardianDto {}
export class UpdateGuardianDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(PHONE) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) occupation?: string;
}
