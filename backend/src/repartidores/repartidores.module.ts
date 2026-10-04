import { Module } from '@nestjs/common';
import { RepartidoresController } from './repartidores.controller';
import { RepartidoresService } from './repartidores.service';

@Module({
  controllers: [RepartidoresController],
  providers: [RepartidoresService],
})
export class RepartidoresModule {}
