import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuditService } from '../../audit/audit.service';
import type { AuthRequest } from '../auth.types';

const METODOS_AUDITADOS = ['POST', 'PUT', 'PATCH', 'DELETE'];
// El login registra su propio evento (LOGIN / LOGIN_FALLIDO) en AuthService
const RUTAS_EXCLUIDAS = ['/api/auth/login'];

/**
 * Registra automáticamente en la tabla "auditoria" toda operación que modifica datos:
 * quién (usuario), qué (método + ruta + cuerpo sin contraseñas), cuándo y con qué resultado.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const ruta = req.originalUrl.split('?')[0];

    if (!METODOS_AUDITADOS.includes(req.method) || RUTAS_EXCLUIDAS.includes(ruta)) {
      return next.handle();
    }

    const base = {
      usuarioId: req.user?.sub,
      accion: req.method,
      recurso: ruta,
      ip: req.ip,
      detalle: { params: req.params, body: req.body },
    };

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<{ statusCode: number }>();
        void this.audit.registrar({ ...base, estadoHttp: res.statusCode });
      }),
      catchError((err: unknown) => {
        const estado = err instanceof HttpException ? err.getStatus() : 500;
        void this.audit.registrar({ ...base, estadoHttp: estado });
        return throwError(() => err);
      }),
    );
  }
}
