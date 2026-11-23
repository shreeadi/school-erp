import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { StaffType } from '../../generated/prisma/enums.js';

export class CreateStaffDto {
  @ApiProperty() @IsString() @Length(2, 120) fullName: string;
  @ApiProperty() @IsEmail() @Transform(({ value }) => String(value).trim().toLowerCase()) email: string;
  @ApiPropertyOptional({ example: '+919876543210' }) @IsOptional() @Matches(/^\+?[0-9]{10,15}$/) phone?: string;
  @ApiProperty({ example: 'EMP0042' }) @Matches(/^[A-Za-z0-9-]{2,20}$/) employeeCode: string;
  @ApiProperty({ example: 'TGT Mathematics' }) @IsString() @Length(2, 80) designation: string;
  @ApiProperty({ enum: StaffType }) @IsEnum(StaffType) staffType: StaffType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) qualifications?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfJoining?: string;
  @ApiPropertyOptional({ description: 'Role keys to grant, e.g. ["TEACHER"]. Defaults to TEACHER for teaching staff.' })
  @IsOptional() @IsArray() @IsString({ each: true }) roleKeys?: string[];
}

export class UpdateStaffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9]{10,15}$/) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) designation?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() departmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) qualifications?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateAssignmentDto {
  @ApiProperty() @IsUUID() sectionId: string;
  @ApiProperty() @IsUUID() subjectId: string;
}
