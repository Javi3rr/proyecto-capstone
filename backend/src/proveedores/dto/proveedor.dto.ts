import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class CrearProveedorDto {
  /** Obligatorio; se valida el dígito verificador */
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El RUT es obligatorio' })
  @MaxLength(12)
  rut!: string;

  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  @MaxLength(150)
  razonSocial!: string;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contacto?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  email?: string | null;
}

export class ActualizarProveedorDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(12)
  rut?: string;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La razón social no puede quedar vacía' })
  @MaxLength(150)
  razonSocial?: string;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contacto?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
