# Propuesta: benchmark de calidad y eficiencia de agentes

**Estado:** propuesta informativa; no implementada ni aprobada como norma.  
**Origen:** ideas no redundantes del respaldo histórico `b21d514` (`template v2.1/INSTRUCCION_CLAUDE_CODE_TEMPLATE_V2_PRO_SDD_ODD_TOKEN_EFFICIENT.md`).  
**Fuente normativa vigente:** `docs/SETUP.md`, `CLAUDE.md` y agentes de `.claude/agents/`.

## Propósito

Comprobar, con evidencia reproducible, si un cambio en instrucciones, herramientas o manejo de contexto mejora los resultados de desarrollo **sin comprometer funcionalidad, seguridad ni gobernanza**. Optimizar tokens por sí solo no justifica cambios que reduzcan calidad.

Este documento **no** modifica rutas READ-ONLY/BUILD/SDD, autorizaciones, firmas, hooks, permisos, ni requisitos del reviewer. Todo cambio de gobierno futuro debe seguir el flujo y las autorizaciones vigentes.

## Casos representativos

| Caso | Trabajo sobre datos sintéticos | Ruta esperada según las reglas actuales | Riesgo principal |
|---|---|---|---|
| B01 | Corrección visual o de metadatos localizada | BUILD, únicamente si cumple los límites actuales | Sobredocumentación y retrabajo |
| B02 | CRUD con validaciones, búsqueda y filtros | SDD-LITE o SDD-ADVANCED si implica riesgos de datos/seguridad | Contratos y regresiones |
| B03 | Gestión de identidades, roles y revocación | SDD-ADVANCED | Escalada de privilegios y acceso indebido |
| B04 | Diseño de reservas concurrentes y multirrol | SDD-ADVANCED | Duplicados, integridad, idempotencia y concurrencia |

La clasificación real siempre la determina `docs/SETUP.md`. Estos ejemplos no otorgan autorización para implementar.

## Diseño experimental propuesto

1. Definir una referencia base (commit), una variante candidata y el cambio exacto evaluado.
2. Ejecutar los mismos casos en entornos aislados, con versiones comparables de Node, dependencias, herramientas y modelo/esfuerzo.
3. Utilizar datos ficticios; excluir credenciales, bases reales, PII y despliegues.
4. Conservar el mismo alcance, criterios de aceptación, restricciones de seguridad y procedimiento de revisión.
5. Registrar explícitamente los efectos de caché, el contexto disponible, fallos de herramientas y cualquier diferencia que sesgue la comparación.
6. Repetir ejecuciones si la variabilidad impide concluir; distinguir resultados medidos de observaciones cualitativas.
7. Obtener aprobación humana para experimentar con cambios de gobierno antes de modificar agentes, hooks o reglas protegidas.

## Métricas y evidencias

| Dimensión | Qué registrar | Evidencia |
|---|---|---|
| Funcionalidad | Criterios de aceptación cumplidos / aplicables, identificados por AC | Resultado del reviewer y pruebas |
| Seguridad | Hallazgos críticos, controles de permisos y pruebas negativas | Casos reproducibles; fallos no ocultados |
| Calidad | Tests/lint/build que correspondan, defectos y cambios fuera de alcance | Comandos, salidas resumidas y diff |
| Tiempo | Duración real de inicio a cierre | Marcas de tiempo registradas |
| Tokens/costo | Uso y costo reportado por las herramientas, cuando esté disponible | Medición real; si falta, `NO MEDIDO` |
| Eficiencia de agentes | Delegaciones, reintentos, ciclos reviewer↔developer | Registro de ejecución |
| Contexto | Material consultado, duplicación evitable y tamaño de handoffs | Registro de archivos y transferencias |
| Trazabilidad | Regla → contrato/modelo → AC → prueba → evidencia | Matriz enlazada |

No inferir costo por caracteres ni asignar porcentajes de ahorro no observados. El éxito requiere mantener la calidad y los controles; el consumo de tokens es una variable secundaria.

## Hipótesis opcionales a contrastar

- **Contexto progresivo:** facilitar un índice conciso de reglas y cargar referencias detalladas solo cuando aplican puede reducir lecturas redundantes. No imponer nuevas carpetas ni duplicar `docs/SETUP.md` antes de medir el beneficio.
- **Handoff breve:** conservar objetivo, decisiones, archivos, verificaciones, pendientes y próximo gate podría reducir retrabajo entre sesiones. No reemplaza specs, firmas ni evidencia.
- **Delegación proporcional:** no convocar subagentes que la ruta actual no requiere podría mejorar costo y tiempo sin reducir la revisión independiente.

Son hipótesis, **no instrucciones operativas nuevas**.

## Ficha mínima por ejecución

```text
CASO / REFERENCIA / VARIANTE / ENTORNO:
RUTA Y AUTORIZACIONES APLICABLES:
CRITERIOS Y PRUEBAS:
RESULTADOS: PASS | FAIL | NO EJECUTADO (motivo)
SEGURIDAD / HALLAZGOS:
TIEMPO / TOKENS / COSTO: medición o NO MEDIDO
DELEGACIONES / RETRABAJO:
DIFERENCIAS Y LIMITACIONES:
DICTAMEN: GO | NO-GO | INCONCLUSO
```

## Criterios de cierre

Emitir **GO** solo si la variante preserva los controles de gobierno, no introduce defectos bloqueantes y muestra una mejora observada relevante para el objetivo definido. Emitir **NO-GO** ante regresión crítica o incumplimiento de seguridad. Declarar **INCONCLUSO** si faltan datos comparables.

La eventual adopción de cambios requiere propuesta y aprobación por el proceso vigente; **este documento no autoriza cambios, merges ni despliegues**.
