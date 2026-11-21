# Integración continua (GitHub Actions)

Pipeline definido en [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml). Se ejecuta en cada push a `main` y en cada Pull Request hacia `main`.

| Etapa | Qué revisa |
|---|---|
| Backend | Tipos de TypeScript, migraciones aplicadas sobre un PostgreSQL limpio, pruebas automatizadas (Jest) y compilación |
| Frontend | Compilación de producción de Angular |
| Imágenes Docker | Construcción de las imágenes del API y web; solo corre si las dos etapas anteriores pasan |

Un PR solo se une a `main` con las tres etapas en verde.

## Ejecuciones

| Fecha | Cambio | Evento | Rama | Resultado | Duración |
|---|---|---|---|---|---|
| 21-11-2026 | Merge pull request #11 from Javi3rr/chore/ordenar-repositorio | push | `main` | ✅ aprobado | 2 min 47 s |
| 21-11-2026 | chore: ordenar el repositorio | Pull Request | `chore/ordenar-repositorio` | ✅ aprobado | 3 min 15 s |
| 17-11-2026 | Merge pull request #10 from Javi3rr/feature/presentacion-feedback-3 | push | `main` | ✅ aprobado | 3 min 0 s |
| 17-11-2026 | docs(fase3): presentación con el tercer feedback del profesor | Pull Request | `feature/presentacion-feedback-3` | ✅ aprobado | 3 min 3 s |
| 17-11-2026 | Merge pull request #9 from Javi3rr/feature/ci-pipeline | push | `main` | ✅ aprobado | 3 min 8 s |
| 17-11-2026 | ci: pipeline de integración continua (GitHub Actions) | Pull Request | `feature/ci-pipeline` | ✅ aprobado | 2 min 56 s |

Historial completo: https://github.com/Javi3rr/proyecto-capstone/actions
