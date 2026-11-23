import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import { GuardiansController } from './guardians.controller.js';
import { StaffController } from './staff.controller.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  controllers: [StaffController, StudentsController, GuardiansController],
  providers: [AccountsService, StudentsService],
  exports: [AccountsService, StudentsService],
})
export class PeopleModule {}
