import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AttemptsModule } from './attempts/attempts.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { InstructorModule } from './instructor/instructor.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScenariosModule } from './scenarios/scenarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    // General API limit per IP; credential endpoints use a tighter @Throttle (NFR-13).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    ScenariosModule,
    InstructorModule,
    AttemptsModule,
  ],
})
export class AppModule {}
