import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { LoginResponse, Rol, Usuario } from './models';

interface Sesion {
  token: string;
  usuario: Usuario;
}

const CLAVE_SESION = 'patopan.sesion';

const INICIO_POR_ROL: Record<Rol, string> = {
  ADMIN: '/admin',
  MESON: '/meson',
  DESPACHO: '/despacho',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly sesion = signal<Sesion | null>(this.cargarSesion());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);

  get token(): string | null {
    return this.sesion()?.token ?? null;
  }

  login(username: string, password: string): Observable<Usuario> {
    return this.http.post<LoginResponse>('/api/auth/login', { username, password }).pipe(
      tap((r) => this.guardarSesion({ token: r.accessToken, usuario: r.usuario })),
      map((r) => r.usuario),
    );
  }

  logout(): void {
    try {
      localStorage.removeItem(CLAVE_SESION);
    } catch {
      /* almacenamiento no disponible */
    }
    this.sesion.set(null);
    void this.router.navigate(['/login']);
  }

  /** Ruta de inicio según el rol del usuario conectado */
  rutaInicio(): string {
    const u = this.usuario();
    return u ? INICIO_POR_ROL[u.rol] : '/login';
  }

  tieneRol(...roles: Rol[]): boolean {
    const u = this.usuario();
    return !!u && (u.rol === 'ADMIN' || roles.includes(u.rol));
  }

  private guardarSesion(s: Sesion): void {
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    } catch {
      /* almacenamiento no disponible: la sesión dura mientras la pestaña esté abierta */
    }
    this.sesion.set(s);
  }

  private cargarSesion(): Sesion | null {
    try {
      const raw = localStorage.getItem(CLAVE_SESION);
      if (!raw) return null;
      const s = JSON.parse(raw) as Sesion;
      return this.tokenVigente(s.token) ? s : null;
    } catch {
      return null;
    }
  }

  private tokenVigente(token: string): boolean {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64)) as { exp?: number };
      return !payload.exp || payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}
