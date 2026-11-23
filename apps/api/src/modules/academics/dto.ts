import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { GradingScaleType, SubjectType } from '../../generated/prisma/enums.js';

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2026-27' }) @IsString() @Length(2, 40) name: string;
  @ApiProperty({ example: '2026-04-01' }) @IsDateString() startDate: string;
  @ApiProperty({ example: '2027-03-31' }) @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCurrent?: boolean;
}
export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class CreateGradeDto {
  @ApiProperty({ example: 'Class 10' }) @IsString() @Length(1, 60) name: string;
  @ApiProperty({ example: 'X' }) @Matches(/^[A-Za-z0-9-]{1,12}$/) code: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
export class UpdateGradeDto extends PartialType(CreateGradeDto) {}

export class CreateSectionDto {
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiProperty() @IsUUID() gradeId: string;
  @ApiProperty({ example: 'A' }) @IsString() @Length(1, 30) name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 40) room?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classTeacherId?: string;
}
export class UpdateSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 30) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 40) room?: string;
  @ApiPropertyOptional({ nullable: true, description: 'null removes the class teacher' }) @IsOptional() @IsUUID() classTeacherId?: string | null;
}

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Science' }) @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() headId?: string;
}
export class UpdateDepartmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() headId?: string | null;
}

export class CreateSubjectDto {
  @ApiProperty({ example: 'MATH' }) @Matches(/^[A-Za-z0-9-]{2,16}$/) code: string;
  @ApiProperty({ example: 'Mathematics' }) @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional({ enum: SubjectType }) @IsOptional() @IsEnum(SubjectType) type?: SubjectType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
}
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

export class CurriculumEntryDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isElective?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(60) periodsPerWeek?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gradingScaleId?: string;
}
export class SetCurriculumDto {
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiProperty() @IsUUID() gradeId: string;
  @ApiProperty({ type: [CurriculumEntryDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CurriculumEntryDto) subjects: CurriculumEntryDto[];
}

export class GradingBandDto {
  @ApiProperty({ example: 'A1' }) @IsString() @Length(1, 20) label: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) minPercent: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) maxPercent: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(99) gradePoint?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) remark?: string;
}
export class CreateGradingScaleDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty({ enum: GradingScaleType }) @IsEnum(GradingScaleType) type: GradingScaleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ default: 33 }) @IsOptional() @IsNumber() @Min(0) @Max(100) passPercent?: number;
  @ApiProperty({ type: [GradingBandDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => GradingBandDto)
  bands: GradingBandDto[];
}

export class CreateExamCategoryDto {
  @ApiProperty({ example: 'Unit Test' }) @IsString() @Length(2, 80) name: string;
  @ApiProperty({ example: 'UT' }) @Matches(/^[A-Za-z0-9-]{1,12}$/) code: string;
  @ApiProperty({ example: 20 }) @IsNumber() @Min(0) @Max(100) weightage: number;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @IsInt() @Min(1) @Max(1000) defaultMaxMarks?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) passingMarks?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isInternal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
export class UpdateExamCategoryDto extends PartialType(CreateExamCategoryDto) {}
