import { Module } from '@nestjs/common';
import { PreciosModule } from '../precios/precios.module';
import { PlanillaController } from './planilla.controller';
import { PlanillaService } from './planilla.service';

@Module({
  imports: [PreciosModule],
  controllers: [PlanillaController],
  providers: [PlanillaService],
})
export class PlanillaModule {}
