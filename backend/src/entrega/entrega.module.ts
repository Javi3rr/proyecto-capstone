import { Module } from '@nestjs/common';
import { EntregaController } from './entrega.controller';
import { EntregaService } from './entrega.service';

@Module({
  controllers: [EntregaController],
  providers: [EntregaService],
})
export class EntregaModule {}
