import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class NoPagoDto {
  /** Ej.: "No estaba", "Paga el lunes" */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string | null;
}
