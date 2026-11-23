import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { ProvisioningService } from './provisioning.service.js';

@Module({ controllers: [PlatformController], providers: [ProvisioningService], exports: [ProvisioningService] })
export class PlatformModule {}
