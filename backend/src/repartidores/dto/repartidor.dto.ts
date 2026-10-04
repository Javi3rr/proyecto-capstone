import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
