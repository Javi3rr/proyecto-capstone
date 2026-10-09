import { Module } from '@nestjs/common';
import { MantencionController } from './mantencion.controller';
import { MantencionService } from './mantencion.service';

@Module({
  controllers: [MantencionController],
  providers: [MantencionService],
})
export class MantencionModule {}
