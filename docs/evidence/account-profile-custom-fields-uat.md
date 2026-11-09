# Evidencia: UX-1 (campos personalizados del perfil), registro de evidencia

Documentación informativa: no es normativa ni autoriza nada. Todo dato no disponible figura como «NO ACREDITADO».

- Iniciativa: UX-1, campos personalizados del perfil.
- Spec: `account-profile-custom-fields.md` (en la carpeta de specs del repositorio; SDD-ADVANCED, Fase 1, aprobada y firmada).
- Rama: `feat/ux-users-improvements`.
- Fecha: 2026-11-09.

## 1. Versión revisada y probada

- No existe commit. Versión = HEAD `9e0831e` + árbol de trabajo.
- Huella combinada (SHA256 por archivo con `\r\n`→`\n`; combinado = sha256 de las líneas `ruta<TAB>hash` ordenadas por ruta, unidas con `\n` y con `\n` final): `dab5f0063a40f5fad1a29cb37420869f733a2e3cef40f2cf77048c5ccf1c905d`.
- 15 archivos del plan.
- Última escritura de código de producción: `modules/account/components/CustomFieldForm.tsx` a las 12:24:53.
- Última escritura del árbol: `modules/account/components/CustomFieldForm.test.tsx` a las 12:25:27 (archivo de test, no ejecutable en producción).
- Orden de eventos: el cierre de la fase (casillas de la spec marcadas a las 12:28:04) precedió a la preparación de la base desechable, a las pruebas de integridad y a la UAT manual. Por tanto esas pruebas se hicieron después de las últimas escrituras. Horarios exactos de esas pruebas: NO ACREDITADOS.

## 2. Evidencia técnica automatizada

Ejecutada por el agente Reviewer en 3 ciclos; el último sobre el árbol revisado.

| Comprobación | Resultado |
|---|---|
| `vitest` completo | PASS: 431 pass / 7 omitidos (16 archivos; 1 omitido: la prueba de integridad, sin DISPOSABLE_DATABASE_URL) |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

- Diff = exactamente los 15 archivos del plan + spec + `.sig` + 1 línea de ledger.
- Sin cambios en gobierno, `lib/`, `scripts/`, `package*.json`, otros `db/` ni `.env*`.
- Escaneo de secretos: sin coincidencias.
- Huella de la spec según la regla del hook: `c768fb50d329dfcbe0b752b56169f33c4e273c896a253d24cd2a327c7ef5a231`, igual a la del ledger.
- Veredicto final: APROBADO, 0 bloqueantes, 3 observaciones menores:
  1. Región `role="status"` solo en CustomFieldForm.
  2. `aria-label` con la etiqueta guardada.
  3. La base no rechaza los separadores Unicode U+2028/U+2029, solo zod.

## 3. Pruebas de integridad I-01 a I-07

Base Neon desechable independiente (sin datos de DEV ni PROD); numeración de la spec.

| Id | Cobertura |
|---|---|
| I-01 | FK y cascada |
| I-02 | SQL directo contra checks y unique |
| I-03 | Checks y unicidad de etiqueta |
| I-04 | Swap y compactación |
| I-05 | 12 altas concurrentes → 10 filas |
| I-06 | Swaps y borrados concurrentes |
| I-07 | Rollback |

- Resultado: 7/7 PASS en 10.75 s, **reportado por el propietario**. Salida por caso: NO ACREDITADA.
- Migraciones 0001–0004 aplicadas solo en esa base desechable (4 entradas en `schema_migrations` verificadas por el propietario en la consola de Neon).
- Preflight (modos migrate, test y dev, con aislamiento de Neon y Clerk): PASS, reportado por el propietario. Salidas: NO ACREDITADAS.
- Suposiciones S1–S6 de Neon/PostgreSQL: coherentes con I-02..I-07; la spec las mantiene como «sin verificar» (no se editó).
- La advertencia «Running SQL directly from the browser…» del driver Neon es un falso positivo del entorno jsdom (se emite si existen `window` y `document`); el service es server-only.

## 4. Aceptación funcional (UAT manual)

Declarada por el usuario funcional, en entorno desechable aislado (base Neon desechable + aplicación Clerk de desarrollo nueva y vacía).

| Id | Prueba | Resultado |
|---|---|---|
| M-01 | Crear un campo | PASS |
| M-02 | Ordenar campos | PASS CON OBSERVACIÓN UX1-ADJ-01 |
| M-03 | Editar y eliminar un campo | PASS |
| M-04 | Seguridad entre usuarios (superadmin, user y admin del entorno desechable; sin correos ni identificadores) | PASS |
| M-05 | Compatibilidad del perfil | PASS |
| M-06 | Validaciones y seguridad | PASS |
| M-07 | Accesibilidad | PASS |

- Historial de M-02: un BLOQUEADO previo, marcado en una guía interactiva de UAT, fue superado por revalidación. La causa técnica no está confirmada y no se declara bug; no hay evidencia de error técnico al usar los controles del diálogo.
- Detalle por prueba (pasos, cuentas, capturas, horarios): NO ACREDITADO.
- Estado: aceptación declarada por el usuario funcional; no equivale a `apruebo` ni a `autorizo gobierno`.

## 5. UX1-ADJ-01 (mejora UX independiente, enviada al backlog por el propietario)

- Propuesta: permitir reordenar los campos personalizados directamente desde Información personal, sin abrir el diálogo de edición.
- Referencias: decisión D-UX1-6 y AC-24 de la spec firmada (que fija el reordenamiento dentro del diálogo).
- No se modifica código ni la spec firmada.
- Ruta futura probable (a confirmar tras verificación completa): spec adicional que sustituya D-UX1-6; no autorizada.

## 6. Evidencia NO ACREDITADA / pendiente

- Salidas de los preflight, de la migración y de I-01..I-07 por caso.
- Detalle de cada prueba manual, capturas y horarios.
- Verificación en vivo contra Figma (nodo 10:2848); se usó la especificación visual versionada de la carpeta de specs.
- Estado de 0004 en DEV y PROD: «no aplicada» es afirmación del propietario, no verificable por los agentes.

## 7. Dependencias de despliegue y riesgos residuales

Dependencias (no ejecutadas):
- Aplicar la migración 0004 en DEV y luego en PROD ANTES de desplegar este código; si no, `/dashboard/profile` falla al leer la tabla.
- Requiere orden expresa del propietario; ningún agente la ejecuta.

Riesgos residuales:
- La guarda de las pruebas de integridad solo cubre los hosts de `DATABASE_URL` y `DATABASE_URL_UNPOOLED` (P-UX1-7 abierta).
- Posible conflicto en el ledger de aprobaciones al integrar `main`.
