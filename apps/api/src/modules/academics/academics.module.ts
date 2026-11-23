import { Module } from '@nestjs/common';
import { AcademicsController } from './academics.controller.js';
import { GradingController } from './grading.controller.js';

@Module({ controllers: [AcademicsController, GradingController] })
export class AcademicsModule {}
