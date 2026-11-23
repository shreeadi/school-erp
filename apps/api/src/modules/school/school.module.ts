import { Module } from '@nestjs/common';
import { SchoolController } from './school.controller.js';

@Module({ controllers: [SchoolController] })
export class SchoolModule {}
