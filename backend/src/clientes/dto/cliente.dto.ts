import { ModalidadCliente } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class CrearClienteDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120)
  nombre!: string;

  @IsEnum(ModalidadCliente, { message: 'Modalidad inválida (REPARTO, PAGO_DIA_SIGUIENTE o PRESENCIAL)' })
  modalidad!: ModalidadCliente;

  /** Obligatorio para REPARTO y PAGO_DIA_SIGUIENTE; se ignora en PRESENCIAL */
  @IsOptional()
  @IsInt()
  repartidorId?: number | null;

  /** Solo pago día siguiente: repartidor que cobra lo del día anterior (null = el mismo que reparte) */
  @IsOptional()
  @IsInt()
  cobradorId?: number | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  /** RUT del cliente (para la guía electrónica del SII). Se valida el dígito verificador. */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(12)
  rut?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  razonSocial?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  giro?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  comuna?: string | null;

  /** Si no se indica, el cliente queda al final de su grupo en la planilla */
  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  /** null = usa el precio general vigente */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Precio especial inválido' })
  @Min(1)
  @Max(1_000_000)
  precioKgEspecial?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Descuento de kg inválido' })
  @Min(0)
  @Max(1000)
  kgDescuentoDiario?: number;
}

export class ActualizarClienteDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío' })
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEnum(ModalidadCliente, { message: 'Modalidad inválida (REPARTO, PAGO_DIA_SIGUIENTE o PRESENCIAL)' })
  modalidad?: ModalidadCliente;

  @IsOptional()
  @IsInt()
  repartidorId?: number | null;

  /** Solo pago día siguiente: repartidor que cobra lo del día anterior (null = el mismo que reparte) */
  @IsOptional()
  @IsInt()
  cobradorId?: number | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  /** RUT del cliente (para la guía electrónica del SII). Se valida el dígito verificador. */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(12)
  rut?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  razonSocial?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  giro?: string | null;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  comuna?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Precio especial inválido' })
  @Min(1)
  @Max(1_000_000)
  precioKgEspecial?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Descuento de kg inválido' })
  @Min(0)
  @Max(1000)
  kgDescuentoDiario?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
