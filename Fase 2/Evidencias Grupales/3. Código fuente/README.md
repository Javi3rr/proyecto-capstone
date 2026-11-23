# Código fuente

El código vigente está en este mismo repositorio, [Javi3rr/proyecto-capstone](https://github.com/Javi3rr/proyecto-capstone):

| Carpeta | Contenido |
|---|---|
| [`backend/`](../../../backend/) | API REST: NestJS 11 + Prisma 6, migraciones de PostgreSQL y pruebas automatizadas (Jest). |
| [`frontend/`](../../../frontend/) | Aplicación web: Angular 19, servida por Nginx. |
| [`docker-compose.yml`](../../../docker-compose.yml) | Levanta los 3 contenedores (web, api y base de datos). |
| [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) | Pipeline de integración continua. |

## Historial de repositorios

| Repositorio | Uso |
|---|---|
| [ortgvdev/patopan](https://github.com/ortgvdev/patopan) | Desarrollo de la Fase 2: base del sistema, despacho, mesón y administración (12 Pull Requests). Su historial quedó incorporado a este repositorio. |
| [Javi3rr/proyecto-capstone](https://github.com/Javi3rr/proyecto-capstone) | Repositorio del ramo y del código desde la Fase 3: documentos SII, simulación, integración continua y entregables (11 Pull Requests). |
| [ortgvdev/patopan-metricas](https://github.com/ortgvdev/patopan-metricas) | Panel de métricas del avance según Trello (Angular + NestJS), independiente del sistema. |

Evidencia de cada Pull Request: [Fase 3 · Evidencias de trabajo](../../../Fase%203/Evidencias%20Grupales/5.%20Evidencias%20de%20trabajo/pull-requests.md).

Para obtener la versión entregada como `.zip`:

```bash
git archive --format=zip -o patopan.zip main
```
