# Manual de instalación

Instalación del sistema Patopan en el **mini PC de la panadería**, que actúa como servidor local. Los PC de despacho, mesón y administración solo necesitan un navegador.

## 1. Requisitos del mini PC

| Elemento | Detalle |
|---|---|
| Sistema operativo | Windows 10/11 (o Linux) |
| Software | [Docker Desktop](https://www.docker.com/products/docker-desktop/) con Docker Compose v2, encendido al iniciar el equipo |
| Red | Conectado al router de la panadería, idealmente con IP fija (ej. `192.168.1.13`) |
| Internet | Solo para el envío de documentos al SII (proveedor OpenFactura) y el respaldo |
| Balanzas | Balanzas CAS con IP fija en la misma red |

## 2. Instalar

```powershell
# 1. Obtener el sistema
git clone https://github.com/Javi3rr/proyecto-capstone.git
cd proyecto-capstone

# 2. Configuración: copiar el ejemplo y completarlo
Copy-Item .env.example .env
notepad .env
```

En el `.env` se definen la base de datos (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`), la clave de las sesiones (`JWT_SECRET`), el puerto web (`WEB_PORT`, por defecto 8080) y la conexión con el proveedor del SII (`DTE_MODO`, `DTE_API_KEY` y los datos del emisor `DTE_EMISOR_*`). Es un archivo con claves: **no se sube a GitHub**.

| `DTE_MODO` | Uso |
|---|---|
| `simulado` | Sin conexión, folios de prueba. Para capacitación. |
| `pruebas` | Ambiente de pruebas del proveedor, sin efecto tributario. |
| `produccion` | Emisión real: requiere contrato con el proveedor, certificado digital y folios del SII. |

```powershell
# 3. Levantar los 3 contenedores (web, api y base de datos)
docker compose up -d --build

# 4. Comprobar que están arriba (api "healthy")
docker compose ps
```

El sistema queda en **http://localhost:8080** en el mini PC y en **http://IP-DEL-MINI-PC:8080** desde los demás equipos. Si no se puede entrar desde otro PC, permita el puerto **8080** en el firewall de Windows del mini PC.

Al iniciar, el sistema crea o actualiza las tablas (migraciones). La primera vez deje `SEED_ON_START=true` en el `.env` para crear los usuarios iniciales; luego cámbielo a `false`. **Cambie sus contraseñas de inmediato** desde *Administración → Usuarios*.

## 3. Operación

| Acción | Comando |
|---|---|
| Ver si está funcionando | `docker compose ps` |
| Ver errores del servidor | `docker compose logs -f api` |
| Detener | `docker compose stop` |
| Volver a encender | `docker compose up -d` |
| Actualizar a una versión nueva | `git pull` y luego `docker compose up -d --build` |

> `docker compose down -v` **borra la base de datos**. No lo use en el mini PC de la panadería.

## 4. Respaldo

Los datos viven en el volumen `pgdata` (base de datos) y los PDF/XML de los documentos SII y las fotos de facturas en `uploads`. Copia manual de la base de datos:

```powershell
# Reemplace USUARIO y BASE por los valores de POSTGRES_USER y POSTGRES_DB del .env
docker exec patopan-db pg_dump -U USUARIO BASE > respaldo-patopan.sql
```

Guarde el archivo fuera del mini PC (por ejemplo, en la nube). Para la operación diaria se recomienda automatizarlo una vez al día.

## 5. Solución de problemas

| Problema | Qué revisar |
|---|---|
| La página no carga | Que Docker Desktop esté abierto y `docker compose ps` muestre los 3 contenedores arriba. |
| Desde otro PC no carga | IP del mini PC y regla del firewall para el puerto 8080. |
| Las guías salen "SIN FOLIO SII" | Conexión a internet, `DTE_MODO` y datos del `.env`; RUT y patente de los repartidores. |
| Se cortó la luz | Al volver, Docker Desktop vuelve a levantar los contenedores solo (`restart: unless-stopped`). Si no, `docker compose up -d`. |
