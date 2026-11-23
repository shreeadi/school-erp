import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import type { SchoolActor } from '../../common/request-context.js';
import { TenantDb } from '../../prisma/tenant-db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateExamCategoryDto, CreateGradingScaleDto, type GradingBandDto, UpdateExamCategoryDto } from './dto.js';

/** Bands must not overlap; gaps are allowed (e.g. 90.99 → 91). */
export function validateBands(bands: GradingBandDto[]) {
  const sorted = [...bands].sort((x, y) => x.minPercent - y.minPercent);
  for (const b of sorted) if (b.minPercent > b.maxPercent) throw new BadRequestException(`Band ${b.label}: min is above max`);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPercent <= sorted[i - 1].maxPercent) {
      throw new BadRequestException(`Bands ${sorted[i - 1].label} and ${sorted[i].label} overlap`);
    }
  }
  if (new Set(bands.map((b) => b.label)).size !== bands.length) throw new BadRequestException('Band labels must be unique');
}

@ApiTags('Grading & assessment')
@ApiCookieAuth()
@Controller('grading')
export class GradingController {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService) {}

  @Get('scales')
  @RequirePermissions('grading:read')
  listScales() {
    return this.db.run((tx) => tx.gradingScale.findMany({ orderBy: { name: 'asc' }, include: { bands: { orderBy: { minPercent: 'desc' } } } }));
  }

  @Post('scales')
  @RequirePermissions('grading:manage')
  @ApiOperation({ summary: 'Create a grading scale with its bands' })
  createScale(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateGradingScaleDto) {
    validateBands(dto.bands);
    return this.db.run(async (tx) => {
      if (dto.isDefault) await tx.gradingScale.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      const scale = await guardPrisma(tx.gradingScale.create({
        data: { schoolId: a.schoolId, name: dto.name, type: dto.type, description: dto.description, isDefault: dto.isDefault ?? false, passPercent: dto.passPercent ?? 33 },
      }));
      await tx.gradingBand.createMany({ data: dto.bands.map((b, i) => ({ schoolId: a.schoolId, gradingScaleId: scale.id, ...b, sortOrder: i })) });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'grading_scale.created', entityType: 'grading_scale', entityId: scale.id });
      return tx.gradingScale.findUnique({ where: { id: scale.id }, include: { bands: { orderBy: { minPercent: 'desc' } } } });
    });
  }

  @Put('scales/:id')
  @RequirePermissions('grading:manage')
  @ApiOperation({ summary: 'Replace a grading scale and its bands' })
  replaceScale(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGradingScaleDto) {
    validateBands(dto.bands);
    return this.db.run(async (tx) => {
      if (dto.isDefault) await tx.gradingScale.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      await guardPrisma(tx.gradingScale.update({
        where: { id }, data: { name: dto.name, type: dto.type, description: dto.description, isDefault: dto.isDefault ?? false, passPercent: dto.passPercent ?? 33 },
      }));
      await tx.gradingBand.deleteMany({ where: { gradingScaleId: id } });
      await tx.gradingBand.createMany({ data: dto.bands.map((b, i) => ({ schoolId: a.schoolId, gradingScaleId: id, ...b, sortOrder: i })) });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'grading_scale.updated', entityType: 'grading_scale', entityId: id });
      return tx.gradingScale.findUnique({ where: { id }, include: { bands: { orderBy: { minPercent: 'desc' } } } });
    });
  }

  @Get('exam-categories')
  @RequirePermissions('grading:read')
  listCategories() {
    return this.db.run(async (tx) => {
      const items = await tx.examCategory.findMany({ orderBy: { sortOrder: 'asc' } });
      const totalWeightage = items.reduce((n, c) => n + Number(c.weightage), 0);
      return { items, totalWeightage };
    });
  }

  @Post('exam-categories')
  @RequirePermissions('grading:manage')
  createCategory(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateExamCategoryDto) {
    return this.db.run(async (tx) => {
      const c = await guardPrisma(tx.examCategory.create({ data: { schoolId: a.schoolId, ...dto, code: dto.code.toUpperCase() } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'exam_category.created', entityType: 'exam_category', entityId: c.id });
      return c;
    });
  }

  @Patch('exam-categories/:id')
  @RequirePermissions('grading:manage')
  updateCategory(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamCategoryDto) {
    return this.db.run(async (tx) => {
      const c = await guardPrisma(tx.examCategory.update({ where: { id }, data: { ...dto, code: dto.code?.toUpperCase() } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'exam_category.updated', entityType: 'exam_category', entityId: id });
      return c;
    });
  }

  @Delete('exam-categories/:id')
  @HttpCode(204)
  @RequirePermissions('grading:manage')
  async deleteCategory(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.run(async (tx) => {
      await guardPrisma(tx.examCategory.delete({ where: { id } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'exam_category.deleted', entityType: 'exam_category', entityId: id });
    });
  }
}
