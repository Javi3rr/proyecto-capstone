import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { esFechaISO } from './montos';

/** Valida parámetros de fecha 'AAAA-MM-DD' */
@Injectable()
export class ParseFechaPipe implements PipeTransform<string | undefined, string> {
  transform(valor: string | undefined): string {
    if (!esFechaISO(valor)) throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    return valor;
  }
}
