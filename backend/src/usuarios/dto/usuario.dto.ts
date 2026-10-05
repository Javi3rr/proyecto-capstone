import { Rol } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MENSAJE_CLAVE, REGLA_CLAVE } from '../../auth/dto/cambiar-clave.dto';
import { textoLimpio } from '../../common/utils';

const REGLA_USUARIO = /^[a-z0-9._-]{3,50}$/;
const MENSAJE_USUARIO = 'El usuario debe tener 3 a 50 caracteres: minúsculas, números, punto, guion o guion bajo';
const REGLA_CODIGO = /^[0-9A-Za-z-]{1,20}$/;

/** Usuario en minúsculas y sin espacios */
const normalizarUsuario = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CrearUsuarioDto {
  @Transform(normalizarUsuario)
  @IsString()
  @Matches(REGLA_USUARIO, { message: MENSAJE_USUARIO })
  username!: string;

  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120)
  nombre!: string;

  @IsEnum(Rol, { message: 'Rol inválido (ADMIN, MESON o DESPACHO)' })
  rol!: Rol;

  @IsString()
  @MinLength(8, { message: MENSAJE_CLAVE })
  @MaxLength(72)
  @Matches(REGLA_CLAVE, { message: MENSAJE_CLAVE })
  password!: string;

  /** Código de mesonera que imprime la balanza en el voucher */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @Matches(REGLA_CODIGO, { message: 'El código solo admite números, letras y guion (máx. 20)' })
  codigo?: string | null;
}

export class ActualizarUsuarioDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío' })
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEnum(Rol, { message: 'Rol inválido (ADMIN, MESON o DESPACHO)' })
  rol?: Rol;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @Matches(REGLA_CODIGO, { message: 'El código solo admite números, letras y guion (máx. 20)' })
  codigo?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RestablecerClaveDto {
  @IsString()
  @MinLength(8, { message: MENSAJE_CLAVE })
  @MaxLength(72)
  @Matches(REGLA_CLAVE, { message: MENSAJE_CLAVE })
  password!: string;
}
