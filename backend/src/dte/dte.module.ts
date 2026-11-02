import { Module } from '@nestjs/common';
import { DteController } from './dte.controller';
import { DteService } from './dte.service';

@Module({
  controllers: [DteController],
  providers: [DteService],
  exports: [DteService],
})
export class DteModule {}
