import { Module } from '@nestjs/common';
import { CuadreController } from './cuadre.controller';
import { CuadreService } from './cuadre.service';

@Module({
  controllers: [CuadreController],
  providers: [CuadreService],
})
export class CuadreModule {}
