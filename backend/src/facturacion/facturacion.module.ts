import { Module } from '@nestjs/common';
import { DteModule } from '../dte/dte.module';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';

@Module({
  imports: [DteModule],
  controllers: [FacturacionController],
  providers: [FacturacionService],
})
export class FacturacionModule {}
