# Panadería Patopan · Sistema web unificado

Proyecto de título (Capstone). Es un sistema web para la Panadería Patopan con dos secciones:

- **Despacho:** registro digital del pan que sale con los repartidores, guías impresas por caja, cuadre automático por repartidor y gestión de clientes. Emite los documentos tributarios ante el SII: guía de despacho electrónica, factura mensual por cliente con IVA y nota de crédito.
- **Mesón:** registro de facturas de mercadería, inventario y trazabilidad del stock, integrado con las balanzas etiquetadoras.

| Capa | Tecnología |
|---|---|
| Frontend | Angular 19 + Nginx |
| Backend | NestJS 11 (Node.js 22, TypeScript) + Prisma 6 |
| Base de datos | PostgreSQL 16 |
| Contenedores | Docker Compose |

Documentación: [Arquitectura](docs/arquitectura.md) · [Modelo de datos](docs/modelo-datos.md)

---

## 1. Requisitos

- **Docker Desktop** (con Docker Compose v2), encendido.
- **Visual Studio Code** (al abrir la carpeta recomendará las extensiones útiles).
- *Opcional, para desarrollar sin reconstruir contenedores:* **Node.js 22 LTS**.

## 2. Empezar desde cero: eliminar contenedores anteriores

> ⚠️ Esto borra contenedores **y sus datos**. Revisa la lista antes de eliminar, por si tienes contenedores de otros proyectos.

**Si los contenedores antiguos se crearon con un `docker-compose.yml`**, abre una terminal en *esa* carpeta antigua y ejecuta:

```bash
docker compose down -v --rmi local
```

**Si no recuerdas cómo se crearon**, elimínalos uno por uno:

```bash
docker ps -a                      # lista todos los contenedores (NOMBRE en la última columna)
docker rm -f <nombre_o_id>        # elimina el contenedor (repetir por cada uno)

docker volume ls                  # lista los volúmenes (aquí quedan los datos de las BD)
docker volume rm <nombre_volumen> # elimina el volumen

docker image ls                   # opcional: lista imágenes
docker image rm <imagen>          # opcional: libera espacio
```

Solo como último recurso, y **únicamente si no tienes nada más en Docker**: `docker system prune -a --volumes` borra todo lo que no esté en uso.

## 3. Levantar el proyecto

```bash
# 1) En la carpeta del proyecto, crea tu archivo de variables
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
#    -> edita .env y cambia POSTGRES_PASSWORD y JWT_SECRET

# 2) Construye y levanta todo
docker compose up -d --build

# 3) Revisa que todo esté "healthy"
docker compose ps
docker compose logs -f api      # Ctrl + C para salir de los logs
```

La primera vez tarda algunos minutos, porque descarga las imágenes e instala las dependencias.

Luego abre **http://localhost:8080**

| Usuario | Contraseña | Llega a |
|---|---|---|
| `despachador` | `despachadorpatopan` | Despacho (clientes del cuaderno precargados) |
| `meson` | `mesonpatopan` | Mesón |
| `admin` | `adminpatopan` | Administración (ambos módulos + auditoría) |

> Estas contraseñas son las iniciales que pidió el cliente. Deben cambiarse antes de usar el sistema en producción.

### Comandos útiles

| Acción | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver logs de la API | `docker compose logs -f api` |
| Reconstruir tras cambios en el código | `docker compose up -d --build` |
| Detener (conserva los datos) | `docker compose down` |
| Detener y **borrar la base de datos** | `docker compose down -v` |
| Ver la BD en el navegador (Adminer) | `docker compose --profile tools up -d adminer` → http://localhost:8081 (servidor `db`) |
| Probar la API | `curl http://localhost:8080/api/health` |
| Correr las pruebas automatizadas | `cd backend && npm install && npm test` |

## 4. Migraciones de base de datos (Prisma)

El esquema está en `backend/prisma/schema.prisma` y las migraciones versionadas en `backend/prisma/migrations/`. **Al arrancar, la API aplica las migraciones pendientes** (`prisma migrate deploy`), así que basta con `docker compose up -d --build` después de traer cambios.

Para cambiar el modelo:

```bash
docker compose up -d db                # PostgreSQL expuesto en localhost:5432
cd backend
npm install
cp .env.example .env                   # ajusta la clave para que coincida con la del .env raíz
# edita prisma/schema.prisma y luego:
npx prisma migrate dev --name descripcion_del_cambio
```

Haz commit de la carpeta nueva en `migrations/` junto con el cambio de `schema.prisma`.

## 5. Desarrollo con recarga automática (opcional)

Para no reconstruir contenedores en cada cambio:

```bash
docker compose up -d db                      # solo la base de datos en Docker

# Terminal 1 - API en http://localhost:3000/api
cd backend && npm install && cp .env.example .env && npx prisma generate && npm run start:dev

# Terminal 2 - Frontend en http://localhost:4200 (redirige /api a :3000)
cd frontend && npm install && npm start
```

## 6. Documentos electrónicos (SII)

Los documentos tributarios se emiten a través de un proveedor certificado con API (OpenFactura, de Haulmer), que los firma, timbra y envía al SII. El sistema guarda el folio oficial, el estado, el PDF y el XML de cada documento.

| Documento | Dónde | Cuándo |
|---|---|---|
| Guía de despacho (DTE 52) | Despacho → Guías → "Emitir en SII" | Acompaña al pan; se puede emitir una por una o todas las del día. |
| Factura mensual (DTE 33) | Despacho → Facturación | Una por cliente y mes con todas sus guías del mes. Plazo legal: hasta el día 10 del mes siguiente. Solo se factura cuando todas las guías tienen folio SII. |
| Nota de crédito (DTE 61) | Despacho → Facturación → "Anular" | Anula en el SII una factura ya emitida. La factura recién se anula cuando el SII acepta la nota. |

Una **guía de despacho ya emitida no se anula con nota de crédito**, porque el SII no lo acepta. Se anula a mano en el portal del SII o del proveedor; luego, al anularla en el sistema, se confirma que se hizo y queda registrado.

El modo se elige con `DTE_MODO` en `.env` (ver `.env.example`):

| `DTE_MODO` | Uso |
|---|---|
| `simulado` | Sin conexión: asigna folios de prueba. Para clases y demos. |
| `pruebas` | Ambiente de desarrollo de OpenFactura, con datos públicos de prueba. Sin efecto tributario. |
| `produccion` | Emisión real. Requiere contrato con el proveedor, certificado digital, folios (CAF) y los datos del emisor (`DTE_EMISOR_*`). |

En producción cada cliente necesita su RUT (el personal si no tiene de empresa); se completa en Despacho → Clientes.

## 7. Pruebas automatizadas

Pruebas unitarias con Jest de la lógica tributaria: cálculo de la factura, plazo legal, armado de los DTE y reglas de anulación.

```bash
cd backend
npm install
npm test
```

## 8. Estructura del repositorio

```
patopan/
├── docker-compose.yml      # db + api + web (+ adminer opcional)
├── .env.example            # variables de entorno (copiar a .env)
├── backend/                # API NestJS + Prisma
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/  # migraciones versionadas (se aplican al arrancar)
│   ├── prisma/seed.js      # usuarios, repartidores y 40 clientes del cuaderno
│   └── src/                # un módulo por dominio; pruebas en *.spec.ts
├── frontend/               # Angular + Nginx
│   ├── nginx.conf
│   └── src/app/
└── docs/                   # arquitectura y modelo de datos
```

## 9. Flujo de trabajo con Trello y GitHub

Cada historia de usuario del tablero tiene sus **reglas** o **criterios de aceptación** y su **DoD**. Las tarjetas avanzan por las columnas Ideas → Backlog → En Análisis → Listo para Desarrollo → En Desarrollo → Pruebas → 🎉 Terminado.

Se usa una rama de git por tarjeta, con el número de la tarjeta (por ejemplo `feature/48-factura-mensual`). Al terminar, se abre un Pull Request hacia `main` y la tarjeta pasa a **Pruebas** con un comentario que resume lo implementado.
