# Regla de pruebas para async Server Components

- Módulo: docs
- Estado: aprobado
- ID: SPEC-docs-async-rsc-tests
- Riesgo: bajo (solo documentación; toca archivos de gobierno)
- Ruta: SDD-ADVANCED (disparador: edita archivos de gobierno `CLAUDE.md` y `docs/SETUP.md`)
- Fase actual: Fase 1

## Objetivo
`CLAUDE.md` y `docs/SETUP.md` afirman que los async Server Components no se pueden probar con Vitest, pero `app/page.test.tsx` prueba `Home` (async) con Vitest. Reemplazar ambas frases por la regla correcta.

## Alcance y reglas
- Incluye: reemplazar la frase de `CLAUDE.md` (inglés, 1-2 frases) y la de `docs/SETUP.md` (español, párrafo corto o snippet de ≤6 líneas).
- No incluye: `docs/specs/auth-clerk-neon.md` (spec histórica), código, tests, hooks, `.claude/`.
- RN-01: los async Server Components se prueban con Vitest invocándolos como función (`render(await Component())`) y mockeando dependencias de servidor con `vi.mock`; `vi.hoisted` solo cuando haga falta inicializar mocks antes de que `vi.mock` se eleve (hoisting); referencia `app/page.test.tsx`.
- RN-02: `redirect()`/`notFound()` se prueban con un mock que lanza y `await expect(Component()).rejects.toThrow(...)`.
- RN-03: `await Component()` resuelve el Server Component raíz; los async Server Components anidados (nested) pueden requerir mocks (p. ej. mockear el hijo), otras técnicas o pruebas de integración/E2E. No afirmar que siempre exigen E2E.

## Diseño y dependencias
- Solo edición de texto en `CLAUDE.md` (línea ~20) y `docs/SETUP.md` (línea ~431). Sin dependencias.

## Fallos, seguridad y recuperación
| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Edición incorrecta o fuera de alcance | `git status --porcelain` | Corregir | `git checkout -- CLAUDE.md docs/SETUP.md` |

## Criterios de aceptación
- [ ] AC-01 (RN-01) Dado el cambio aplicado, cuando se busca con grep "can't be unit tested" en `CLAUDE.md` y "no se pueden probar con Vitest" en `docs/SETUP.md`, entonces no hay coincidencias.
- [ ] AC-02 (RN-01, RN-02) Dado el cambio aplicado, cuando se hace grep de `await` y `app/page.test.tsx` en ambos archivos, entonces la nueva regla aparece en los dos; `docs/SETUP.md` menciona además `rejects.toThrow` y `vi.mock` (y `vi.hoisted` solo como condicional).
- [ ] AC-03 (RN-03) Dado el cambio aplicado, cuando se hace grep de "nested" en `CLAUDE.md` y "anidad" en `docs/SETUP.md`, entonces ambos indican que `await Component()` cubre el raíz y que los anidados pueden requerir mocks, otras técnicas o integración/E2E, sin exigir E2E como obligatorio ni afirmar que siempre lo requieran.
- [ ] AC-04 Dado el cambio aplicado, cuando se ejecuta `git status --porcelain` (incluye no rastreados; `git diff --name-only` no ve la spec nueva), entonces fuera de `docs/specs/` solo aparecen los 2 archivos de gobierno modificados (`CLAUDE.md`, `docs/SETUP.md`); los artefactos SDD (esta spec, `docs/specs/docs-async-rsc-tests.md.sig`/`.gov.sig`, `docs/specs/approvals.jsonl`) se aceptan pero el developer no los edita.
- [ ] AC-05 Dado el repo, cuando se ejecuta `npx vitest run app/page.test.tsx`, entonces PASS (el patrón documentado funciona). No se exige build.

## Trazabilidad
| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | texto en ambos archivos | AC-01, AC-02, AC-05 | `app/page.test.tsx` + grep |
| RN-02 | texto en `docs/SETUP.md` | AC-02 | grep |
| RN-03 | texto en ambos archivos | AC-03 | grep |

## Cambios de gobierno
- `CLAUDE.md`
- `docs/SETUP.md`

## Plan de tareas
### Fase 1
- [x] T1 — Reemplazar la frase en ambos archivos y verificar AC-01..AC-05 · archivos: `CLAUDE.md`, `docs/SETUP.md` · depende de: — · secuencial (base)

## Definition of Done
AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado figura como NO EJECUTADO con su motivo. Requiere además "autorizo gobierno docs/specs/docs-async-rsc-tests.md".
