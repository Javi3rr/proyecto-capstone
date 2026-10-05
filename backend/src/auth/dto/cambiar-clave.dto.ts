import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Reglas de contraseña: 8 a 72 caracteres (límite de bcrypt), con al menos una letra y un número */
export const REGLA_CLAVE = /^(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d).{8,72}$/;
export const MENSAJE_CLAVE = 'La contraseña debe tener al menos 8 caracteres, con letras y números';

export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty({ message: 'Ingrese su contraseña actual' })
  @MaxLength(100)
  actual!: string;

  @IsString()
  @MinLength(8, { message: MENSAJE_CLAVE })
  @MaxLength(72)
  @Matches(REGLA_CLAVE, { message: MENSAJE_CLAVE })
  nueva!: string;
}
