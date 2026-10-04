import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CrearPrecioKgDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Precio inválido' })
  @Min(1)
  @Max(1_000_000)
  valor!: number;

  /** 'YYYY-MM-DD'. Si no se indica, rige desde hoy. Puede ser una fecha futura (cambio programado). */
  @IsOptional()
  @IsDateString({}, { message: 'Fecha inválida (formato AAAA-MM-DD)' })
  vigenteDesde?: string;
}
