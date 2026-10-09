import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class CrearRepartidorDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120)
  nombre!: string;

  /** Opcional. Se valida el dígito verificador. */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(12)
  rut?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  patente?: string | null;

  /** Paga habitual por día trabajado, en pesos */
  @IsOptional()
  @IsInt({ message: 'La paga debe ser un monto entero en pesos' })
  @Min(0)
  @Max(1_000_000)
  pagaDiaria?: number;
}

export class ActualizarRepartidorDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío' })
  @MaxLength(120)
  nombre?: string;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(12)
  rut?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  patente?: string | null;

  /** Paga habitual por día trabajado, en pesos */
  @IsOptional()
  @IsInt({ message: 'La paga debe ser un monto entero en pesos' })
  @Min(0)
  @Max(1_000_000)
  pagaDiaria?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
