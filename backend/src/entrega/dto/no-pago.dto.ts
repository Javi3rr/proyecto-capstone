import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class NoPagoDto {
  /** Ej.: "No estaba", "Paga el lunes" */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string | null;
}

/** Paga del repartidor ese día, en pesos */
export class PagaDto {
  @IsInt({ message: 'La paga debe ser un monto entero en pesos' })
  @Min(0, { message: 'La paga no puede ser negativa' })
  @Max(1_000_000)
  monto!: number;
}
