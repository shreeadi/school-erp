import { Controller, Get, Module } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor } from '../../common/decorators.js';
import type { SchoolActor } from '../../common/request-context.js';
import { AiClientService } from './ai-client.service.js';

@ApiTags('AI')
@ApiCookieAuth()
@Controller('ai')
class AiController {
  constructor(private readonly ai: AiClientService) {}

  @Get('status')
  @ApiOperation({ summary: 'Checks the AI service is reachable and confined to the caller\'s school' })
  status(@CurrentSchoolActor() actor: SchoolActor) {
    return this.ai.get<{ schoolId: string; visibleSchools: number }>(actor, '/v1/context').then((r) => ({
      reachable: true, schoolId: r.schoolId, isolated: r.schoolId === actor.schoolId && r.visibleSchools <= 1,
    }));
  }
}

@Module({ controllers: [AiController], providers: [AiClientService], exports: [AiClientService] })
export class AiModule {}
