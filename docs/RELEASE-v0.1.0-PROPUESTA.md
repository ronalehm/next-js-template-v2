# Template V2 PRO — Propuesta de primera entrega interna

**Estado:** BORRADOR / pendiente de revisión, autorización humana, tag y GitHub Release.

- **Versión propuesta:** `v0.1.0` (coincide con `package.json` actual). Usar la opción **Pre-release** de GitHub para una entrega interna inicial, sin declararla estabilidad productiva general.
- **Base técnica auditada:** `05aee0090304b718b2ab5f3215de9f24cdca3af9` (24/11/2026, PR #40 integrado).
- **SHA final de entrega:** PENDIENTE. Será el commit resultante del PR documental, *no* el SHA de la base auditada.
- **Repositorio:** `ronalehm/next-js-template-v2` (privado).
- **Paquete:** `private: true`; no publicar en npm.
- **Destinatarios:** equipos de Producto, Frontend, Backend, QA, DevOps e Infraestructura, para crear derivaciones independientes.

## Alcance de esta entrega

1. Base Next.js 16 / React 19 / Node.js 26 / TypeScript / Tailwind / shadcn.
2. Autenticación con Clerk, persistencia Neon, acceso y administración inicial.
3. Cinco agentes existentes: Orchestrator, Spec, Developer, Reviewer y Product (modalidad asistida).
4. Gobierno SDD/ODD basado en `docs/SETUP.md`, hooks y autorizaciones humanas con firma SSH.
5. CI de PR (`checks` y `audit`), junto con los controles operativos de merge.
6. Bootstrap B1 cerrado y Bootstrap B2 probado funcionalmente según declaración del propietario. Agente de replicación aislada creado y utilizado según declaración del propietario.
7. Despliegue de proyecto derivado validado según declaración del propietario.

## Evidencias que deben vincularse antes de emitir la Release

| Evidencia | Estado documental en la repo auditada |
| --- | --- |
| Manual B1 validado v1.2 | No aparece en el árbol de `main`; adjuntar o aportar enlace estable |
| Informe final de B2 | No aparece en el árbol de `main`; referenciar evidencia validada sin divulgar credenciales |
| Agente de replicación | Reportado como creado y utilizado; identificar nombre, ubicación, versión y alcance |
| Despliegue del derivado | Reportado como completado; vincular URL de entorno de prueba, PR/CI y evidencia de verificación |
| README y guía operativa actualizados | Cambios propuestos en este paquete, no integrados aún |
| Gobierno de `main` | Sin protección automática al 24/11/2026; definir protección o aceptación del control compensatorio |
| HTTPS/HSTS y CSP de SEC-1 | Pendientes de cotejar con evidencia posterior antes de declarar `RELEASE-1` |

## Decisión sobre `main` (para aprobación del propietario)

**Opción A — protección automática (preferible cuando disponible):** en GitHub, `Settings → Branches` o `Settings → Rules → Rulesets`, proteger `main`, requerir PR, revisión y checks `checks` + `audit`, restringir force push y borrado. Confirmar el resultado con la API (`protected: true`) y una prueba negativa de push directo en entorno seguro. No configurar unilateralmente.

**Opción B — control compensatorio para repo privada sin función de protección:** mantener repo privada; exigir operativamente rama de trabajo, PR, Reviewer, `checks` y `audit` exitosos, revisión y autorización humana de merge; registrar quién autorizó y SHA antes/después; sincronización `main` solo fast-forward; prohibir por procedimiento push directo y force push. **Riesgo residual:** GitHub no bloquea técnicamente el push directo (`protected: false`). Registrar aceptación expresa del propietario. No describirlo como "rama protegida".

Esta propuesta no modifica `docs/SETUP.md`, hooks ni agentes, y no crea un segundo flujo de aprobación.

## Procedimiento final de publicación (a ejecutar por persona autorizada)

1. Integrar y revisar el PR documental. Si añade el manual B1 original, preservar sus declaraciones y evidencias sin inventar validaciones.
2. Comprobar CI del PR, reviewer y decisión humana. Confirmar `main` y commit final exacto.
3. Confirmar la opción A o B de gobierno de `main` y registrar su evidencia/decisión.
4. Vincular evidencias de B1, B2, agente y despliegue sin copiar secretos ni firmas privadas.
5. Si se decide `RELEASE-1`, verificar específicamente los criterios SEC-1 antes de usar esa denominación.
6. Autorizar expresamente el tag `v0.1.0` apuntando al commit de entrega y crear GitHub Release marcada **Pre-release** con alcance claro.

## Fuera de alcance de esta primera entrega

- No desplegar la **plantilla origen** en producción.
- No usar una instancia Clerk o una base Neon compartida por todos los proyectos.
- No considerar Goal Intake / Roadmap–Orchestrator implementado por el merge de Product E1.
- No convertir Engram + Graphify en dependencia obligatoria.
- No declarar la adopción general del Governance Kit sin su cierre independiente en receptor.
