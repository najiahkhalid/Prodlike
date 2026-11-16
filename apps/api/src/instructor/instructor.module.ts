import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AdminService } from './admin.service';
import { BuilderService } from './builder.service';
import { AdminController, InstructorController, LearnerCohortsController } from './instructor.controller';
import { InstructorService } from './instructor.service';

@Module({
  imports: [ScenariosModule, AttemptsModule],
  controllers: [InstructorController, LearnerCohortsController, AdminController],
  providers: [InstructorService, BuilderService, AdminService],
})
export class InstructorModule {}
