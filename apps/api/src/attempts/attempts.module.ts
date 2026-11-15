import { Module } from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { SandboxReaper } from './sandbox-reaper.service';

@Module({
  imports: [ScenariosModule],
  controllers: [AttemptsController],
  providers: [SandboxService, AttemptsService, SandboxReaper],
  exports: [AttemptsService, SandboxService],
})
export class AttemptsModule {}
