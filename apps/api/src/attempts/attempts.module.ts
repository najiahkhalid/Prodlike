import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EngineBus } from '../engine/engine-bus';
import { EngineGateway } from '../engine/engine.gateway';
import { EngineService } from '../engine/engine.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { MeController } from '../scoring/me.controller';
import { ScoringService } from '../scoring/scoring.service';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { SandboxReaper } from './sandbox-reaper.service';

@Module({
  imports: [ScenariosModule, AuthModule],
  controllers: [AttemptsController, MeController],
  providers: [
    SandboxService,
    EngineBus,
    EngineService,
    ScoringService,
    AttemptsService,
    SandboxReaper,
    EngineGateway,
  ],
  exports: [AttemptsService, SandboxService, EngineService],
})
export class AttemptsModule {}
