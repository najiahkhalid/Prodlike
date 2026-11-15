import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { EngineSnapshot, MetricsTickPayload, PipelineLogPayload } from '@prodlike/shared';

/**
 * In-process pub/sub between the engine (publishes) and the Socket.IO gateway (forwards to the
 * attempt's room). Keeps the engine free of any transport code.
 */
@Injectable()
export class EngineBus extends EventEmitter {
  snapshot(s: EngineSnapshot) {
    this.emit('snapshot', s);
  }
  metrics(m: MetricsTickPayload) {
    this.emit('metrics', m);
  }
  pipelineLog(p: PipelineLogPayload) {
    this.emit('pipelineLog', p);
  }
}
