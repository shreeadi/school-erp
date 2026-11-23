import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 25;

  get skip() { return (this.page - 1) * this.pageSize; }
  get take() { return this.pageSize; }
}

export function paged<T>(items: T[], total: number, q: PageQueryDto) {
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export class SearchPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) search?: string;
}

export class StaffQueryDto extends SearchPageQueryDto {
  @ApiPropertyOptional({ enum: ['TEACHING', 'NON_TEACHING'] }) @IsOptional() @IsEnum(['TEACHING', 'NON_TEACHING']) staffType?: 'TEACHING' | 'NON_TEACHING';
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
}

export class StudentQueryDto extends SearchPageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() gradeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectionId?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'] })
  @IsOptional() @IsEnum(['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED']) status?: string;
}
