# Evidencia: CONTACT-1 (teléfono internacional, sitio web sin protocolo y correos verificados)

**Estado: CONTACT-1 COMPLETADA (2026-11-08).** Automáticas (CA-1 a CA-8) y manuales (CA-9 a CA-17) en PASS, sin bloqueantes. Cierre autorizado por el propietario: commit, push y PR hacia `main`, sin merge.

- Spec: `docs/specs/account-profile-contact.md`, `Fase actual: CONTACT-1`, aprobada el 2026-11-08T18:48:52Z.
  - Hash de la declaración: `928cd442…17882` (coincide con la línea de `docs/specs/approvals.jsonl`).
  - Firma SSH: `docs/specs/account-profile-contact.md.sig`.
- Rama `feat/profile-contact`, worktree `C:/Users/ronal/template-v2-contact`, base `main` en `ca27a9b`.

Origen de cada resultado:
- **Verificado:** lo ejecutó un agente y su salida estaba a la vista.
- **Informado:** lo ejecutó el propietario y lo confirmó en el chat.

## 1. Aprobación (verificado)

- `ssh-keygen -Y verify` sobre la declaración del hook: `Good "spec-approval" signature for approver with ED25519 key SHA256:7AY56U4A0G/3OgsDGsxNf93xujvfn4y5CS5FJGGE1to`.
- Después de la aprobación solo cambiaron las casillas del plan (el hash de la declaración no cambia). Sin cambios en archivos de gobierno (`## Cambios de gobierno`: ninguno).

## 2. Automáticas (verificado; dictamen del Reviewer)

Reviewer de la fase completa (T1 y T2): APROBADO en el ciclo 1, sin bloqueantes, con dos sugerencias opcionales. Revisión acotada de las dos sugerencias aplicadas: APROBADO.

| Criterio | Resultado |
|---|---|
| CA-1 | PASS. `phone.test.ts`: lista y orden de D1 con Perú por defecto, etiquetas con `Intl.DisplayNames`, `toE164`, `formatPhone` y `splitPhone` con los casos de la spec. |
| CA-2 | PASS. `profile.schema.test.ts`: teléfono normalizado a E.164 con tipo, rechazos (letras, `+`, longitud, país `XX`, tipo `mobile` o ausente, claves extra), sitio web normalizado con `https://` sin duplicar protocolos, y rechazos de `javascript:`, `ftp:`, `mailto:` y del valor de 193 caracteres (201 con prefijo). |
| CA-3 | PASS. `profile.service.test.ts`: `phone_type` en lectura y en todo `returning`; sentencia única de `phone` con parámetros `[userId, "+51987654321", "personal"]`; `value: null` envía `[userId, null, null]`; clave fuera del mapa lanza sin llamar a la base. |
| CA-4 | PASS por lectura. La acción mantiene `getActor()`, `dashboard:view`, `safeParse` estricto y `actor.id`; el diálogo envía la entrada sin transformar con `<select>` nativos y `<label>`; `ProfileView` filtra secundarios con `verification?.status === "verified"` y presenta el teléfono según D6; `0003` contiene exactamente la sentencia de "Contratos". |
| CA-5 | PASS. `user_profiles`: solo `0002`, `0003`, `profile.service.ts` y su test. `phone_type`: solo `0003`, `profile.service.ts` y su test. |
| CA-6 | PASS. Mismas tres secciones, sin tarjetas, iconos decorativos ni colores sueltos. Sin cambios en `components/ui/`. |
| CA-7 | PASS. Comando literal de la spec, incluidos archivos sin seguimiento: sin salida. |
| CA-8 | PASS. `npx vitest run` 213/213 (9 archivos); `npx vitest run .claude/hooks` 47/47; `npm run lint` exit 0; `npm run build` exit 0, con `/dashboard/profile` dinámica. `package.json` y `package-lock.json` sin cambios. |

Sugerencias del Reviewer aplicadas después del APROBADO:
1. `profile.schema.test.ts`: se sustituye el caso de longitud sin esquema por los límites reales de R4: 192 caracteres (200 con `https://`) aceptado y 193 caracteres (201) rechazado con "Máximo 200 caracteres.".
2. `ProfileFieldDialog.tsx`: `disabled={isPending}` en el `<select>` de país, el `<select>` de tipo y el `Input` del número. Comprobado de nuevo en el cierre (líneas 112, 130 y 147).

Sugerencia no aplicada (no bloqueante, igual al comportamiento previo de AUTH-2.2): mover `disabled: isPending` a `fieldProps` para cubrir también la nota y los campos genéricos.

## 3. Manuales (propietario, claves de desarrollo, rama de desarrollo de Neon)

Confirmación personal del propietario el 2026-11-08: CA-9 a CA-17 pasaron en localhost.

| Criterio | Resultado |
|---|---|
| CA-9 | PASS (informado). `npm run db:migrate` en Neon DEV: primera ejecución aplica `0003_user_profiles_phone_type.sql` (OK); segunda ejecución, SKIP. |
| CA-10 | PASS (informado). Teléfono peruano con tipo Trabajo. |
| CA-11 | PASS (informado). Teléfono de España en E.164 sin agrupar. |
| CA-12 | PASS (informado). Cambio de tipo, "Quitar" y error de número inválido. |
| CA-13 | PASS (informado). Teléfono antiguo en texto libre. |
| CA-14 | PASS (informado). Sitio web sin protocolo y rechazo de `javascript:`. |
| CA-15 | PASS (informado). Solo correos secundarios verificados. |
| CA-16 | PASS (informado). Varios correos verificados, una sola fila de `app_users`. |
| CA-17 | PASS (informado). Teclado y foco, temas claro y oscuro, 375 px. |

## 4. Cierre (verificado, 2026-11-08)

Repetido por el agente antes del commit: CA-5, CA-7 y CA-8 en PASS y firma SSH válida, con los resultados de la sección 2. Las migraciones `0002` y `0003` no se modifican.
