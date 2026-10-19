import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Lo que el despachador anota por cliente en el día: el total de kg */
export class RegistrarLineaDto {
  /** Normalmente entero; se aceptan decimales para excepciones (ej. 2,5 kg). 0 = no lleva pan. */
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Kg inválidos' })
  @Min(0, { message: 'Los kg no pueden ser negativos' })
  @Max(10000)
  kg!: number;
}

/** Día en que un solo repartidor hace todo el reparto (null = cada uno el suyo) */
export class RepartidorUnicoDto {
  @IsOptional()
  @IsInt()
  repartidorId?: number | null;
}
