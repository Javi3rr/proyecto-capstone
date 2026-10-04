import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Lo que pagó un cliente en el cuadre del día (0 = no pagó / borrar) */
export class RegistrarPagoDto {
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'El monto debe ser un número entero de pesos' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  @Max(50_000_000)
  monto!: number;

  /** Repartidor que rindió el pago (vacío = lo recibió el despachador) */
  @IsOptional()
  @IsInt()
  repartidorId?: number | null;
}
