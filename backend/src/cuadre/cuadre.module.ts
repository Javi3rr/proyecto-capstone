import { Module } from '@nestjs/common';
import { PagosModule } from '../pagos/pagos.module';
import { CuadreController } from './cuadre.controller';
import { CuadreService } from './cuadre.service';

@Module({
  imports: [PagosModule],
  controllers: [CuadreController],
  providers: [CuadreService],
})
export class CuadreModule {}
