import { Module } from '@nestjs/common';
import { ScenarioRegistry } from './scenario-registry.service';
import { AdminScenariosController, ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  controllers: [ScenariosController, AdminScenariosController],
  providers: [ScenarioRegistry, ScenariosService],
  exports: [ScenarioRegistry, ScenariosService],
})
export class ScenariosModule {}
