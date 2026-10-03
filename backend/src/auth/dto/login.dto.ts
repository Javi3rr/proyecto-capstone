import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Ingrese su usuario' })
  @MaxLength(50)
  username!: string;

  @IsString()
  @IsNotEmpty({ message: 'Ingrese su contraseña' })
  @MaxLength(100)
  password!: string;
}
