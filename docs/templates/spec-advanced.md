# Plantilla de spec SDD-ADVANCED

Complementa la "Plantilla de spec" de `docs/SETUP.md` para la ruta SDD-ADVANCED. La spec se guarda en `docs/specs/<module>-<feature>.md`, siempre con `Estado: borrador`.

## Reglas de uso

- Solo las secciones que apliquen: una sección que no aplica se omite, no se deja vacía.
- Cada regla `RN-xx` llega a un contrato o tabla, a un AC y a una prueba en la tabla de trazabilidad.
- **Controles críticos:** cada control crítico tiene al menos un AC negativo con su prueba.
- **Migraciones:**
  > La plantilla exige planes y pruebas de migración cuando correspondan. Ni la plantilla ni una spec aprobada autorizan por sí mismas migraciones, DDL, seeds o borrados en una base real, compartida o de producción. Eso requiere una orden expresa del usuario para esa operación (`docs/SETUP.md`, "Autorizaciones").
- `## Archivos sensibles`, `## Cambios de gobierno` y `## Plan de tareas` conservan su título exacto y el formato de abajo, porque el hook los lee. Una ruta mencionada en otra sección no autoriza nada.

## Plantilla

```md
# <Feature>

- Módulo: <domain>
- Estado: borrador
- ID: SPEC-<module>-<feature>
- Riesgo: alto | medio | bajo (motivo)
- Ruta: SDD-ADVANCED (disparador: ...)
- Fase actual: <fase>

## Objetivo
Qué problema resuelve y para quién.

## Alcance y reglas
- Incluye: ...
- No incluye: ...
- RN-01: <regla de negocio verificable>

## Actores y matriz de acceso
| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| ... | ... | Sí / No | ... |

## Diseño y dependencias
- Rutas (app/), componentes, hooks, services, schemas y stores, con ruta y origen: shadcn (instalado) / shadcn (instalar) / existente (ruta) / nuevo (por qué).
- Dependencias e integraciones externas: ...

## Contratos y datos
- Contrato de API (request/response como schema zod o forma TypeScript): ...
- Tablas, columnas, constraints, índices y migraciones: ...

## No funcionales
- Rendimiento, límites, auditoría, privacidad: ...

## Fallos, seguridad y recuperación
| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| ... | ... | ... | ... |

## Criterios de aceptación
- [ ] AC-01 (RN-01) Dado ..., cuando ..., entonces ...
- [ ] AC-02 (RN-01, negativo) Dado ..., cuando ..., entonces se rechaza ...

## Trazabilidad
| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | ... | AC-01, AC-02 | `ruta/archivo.test.ts` |

## Matriz de pruebas
(conservar solo las filas que apliquen y concretar cada celda)

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Visual local | Si hay lógica | No | Smoke visual | No | No |
| Formulario o CRUD aislado | Sí | API/DB si aplica | Feliz y negativo | Si hay auth | Si cambia DB |
| Auth, sesión, RBAC | Policies | Sesión + DB + webhooks | Acceso por perfil | Obligatoria: IDOR, escalada horizontal y vertical, rol revocado | Según cambios |
| Esquema de base de datos | Validaciones | Constraints, FK, transacciones | Flujo crítico | Acceso por tenant si existe | Obligatorio: plan expand → migrate → contract y reversión, probados solo en base local o desechable |
| Pagos o transacciones | Cálculos y estados | Atomicidad, idempotencia, reintentos | Caso crítico | Obligatoria | Si cambia DB |

## Archivos sensibles
(solo si aplica, para la fase actual)
- `ruta/exacta.ts`

## Cambios de gobierno
(solo si aplica, para la fase actual; requiere además autorización privilegiada)
- `.claude/ruta/exacta`

## Plan de tareas
### Fase <fase>
- [ ] T1 — <tarea> · archivos: ... · depende de: — · secuencial (base)
- [ ] T2 — <tarea> · archivos: ... · depende de: T1 · paralelo
- [ ] T3 — <tarea> · archivos: ... · depende de: T1 · paralelo

## Preguntas abiertas
(solo si hay)

## Definition of Done
AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz figura como NO EJECUTADO con su motivo.
```
