import { Global, Module } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service.js';
import { AccessService } from './access.service.js';

@Global()
@Module({ providers: [AccessService, AccessScopeService], exports: [AccessService, AccessScopeService] })
export class AccessModule {}
