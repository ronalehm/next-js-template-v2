# Perfil: teléfono internacional, sitio web sin protocolo y correos verificados

- Módulo: account
- Estado: aprobado
- ID: SPEC-account-profile-contact
- Riesgo: medio (esquema de base de datos y migración; datos personales)
- Ruta: SDD-ADVANCED
- Fase actual: CONTACT-1
- Fases: CONTACT-1 (única).
- Base: `main` en `ca27a9b` (merge del PR #9, AUTH-2.2). Rama `feat/profile-contact`, worktree `C:/Users/ronal/template-v2-contact`. La aprobación se firma en este worktree (la firma incluye la raíz).
- Antecedentes: `docs/specs/auth-clerk-neon.md`, fase AUTH-2.2 (cerrada, R30 a R37, D29 a D32), y `docs/evidence/auth-profile.md`, sección 4 ("Alcance posterior al cierre").
- AUTH-2.2 no se reabre y AUTH-3 no se toca. `docs/specs/auth-clerk-neon.md` no cambia; esta spec enmienda solo lo que indica sobre R31, R32 y CA-34 de esa fase.

Justificación de la ruta: SDD-ADVANCED, porque la fase añade una migración (`db/migrations/` es ruta sensible y "esquema de base de datos y migraciones" es disparador de riesgo) y trata datos personales (teléfono). Una sola línea con disparador basta según `docs/SETUP.md` §3. Las secciones avanzadas se limitan a las que aplican: contratos, seguridad y recuperación. No hay permisos ni roles nuevos.

## Objetivo

Mejorar el perfil personal (`/dashboard/profile`) del usuario autenticado:
- Teléfono con país, guardado en formato internacional y con tipo.
- Sitio web que acepta direcciones sin `https://`.
- Lista de correos que muestra solo los verificados.

También documenta como contrato la regla de varios correos por cuenta, que el código actual ya cumple.

## Alcance

Incluye:
- Teléfono (D1): país en `<select>` nativo con una lista fija; normalización a E.164; presentación 3-3-3 del celular peruano; tipo Personal, Trabajo o Casa en `<select>` nativo; un solo teléfono.
- Migración incremental `db/migrations/0003_user_profiles_phone_type.sql` con la columna `phone_type`. La ejecuta el propietario.
- Sitio web (D2): anteponer `https://` cuando falta el esquema.
- Correos (D3): en la sección Correos, solo el principal y los secundarios verificados.
- Regla de varios correos por cuenta (D4), como contrato, sin cambios de código.

No incluye:
- Cambios en `db/migrations/0002_user_profiles.sql` (ya aplicada en Neon DEV) ni en datos existentes: los teléfonos guardados no se migran.
- Columna de país: el país se deduce del prefijo guardado.
- Varios teléfonos, extensiones, validación por país (longitudes, prefijos troncales como el `0` o el `15` de Argentina) y países fuera de la lista de D1. Un teléfono antiguo con un prefijo fuera de la lista se muestra tal cual y, al editarlo, se vuelve a escribir.
- Dependencias npm nuevas (`libphonenumber-js` u otras) y componentes shadcn nuevos (`native-select` y `select` existen en el registro, pero D5 pide `<select>` nativo sin componentes nuevos).
- Formularios propios de correos, copia de correos a `user_profiles` o a `app_users` (salvo la sincronización del principal de AUTH-2.2, sin cambios), fusión o reasignación de cuentas, y cualquier cambio en `lib/auth.ts`, autenticación, sesión, Clerk o `app_users`.
- Cambios en la estructura del perfil: siguen Información personal, Correos y Seguridad (D5).
- Cambios en `app/`, `components/`, `lib/`, `scripts/`, `modules/account/index.ts`, `modules/account/server.ts`, `modules/account/utils/profileFields.ts` y su test.
- Ejecutar `db:migrate` desde un agente. Migrar producción.
- Commit, push, merge o PR sin orden expresa del usuario.

## Decisiones

Decisiones del propietario (2026-11-08):

- **D1. Teléfono.**
  - `<select>` nativo de país con una lista corta y fija: Perú (+51) por defecto, Argentina (+54), Bolivia (+591), Brasil (+55), Chile (+56), Colombia (+57), Ecuador (+593), México (+52), España (+34) y Estados Unidos (+1), en ese orden. Nombres en español con `Intl.DisplayNames(["es"], { type: "region" })`. Sin dependencias nuevas.
  - Celular peruano (9 dígitos que empiezan por 9): se muestra agrupado 3-3-3 (`987 654 321`) y se guarda en E.164 (`+51987654321`).
  - Otros números: se guardan en E.164 con su prefijo (validación genérica `^\+[1-9]\d{6,14}$`) y se muestran sin agrupar.
  - El país se deduce del prefijo guardado; no hay columna de país.
  - `<select>` nativo de tipo: Personal, Trabajo, Casa (valores `personal`, `work`, `home`). Un solo teléfono.
  - Migración incremental `0003_user_profiles_phone_type.sql`: columna `phone_type` nullable con `check`, sin modificar datos existentes. `0002` no se toca.
  - La sentencia del teléfono en el mapa cerrado escribe `phone` y `phone_type` juntos; "Quitar" vacía ambos. La entrada del campo `phone` incluye el tipo.
  - Los teléfonos antiguos en texto libre se muestran tal cual y se normalizan al editarlos.
- **D2. Sitio web.** Si el valor no trae esquema, se antepone `https://` (preproceso en el esquema). No se duplican protocolos. `example.com:8080` funciona. `javascript:` y `ftp:` siguen rechazados. Se mantienen `z.httpUrl` y el máximo de 200 caracteres. El caso "sin protocolo" de CA-34 de AUTH-2.2 pasa de rechazado a aceptado con `https://`.
- **D3. Correos.** Clerk sigue siendo la fuente y se gestionan con su modal oficial (`openUserProfile`). Solo se listan los secundarios verificados (`verification?.status === "verified"` en `ProfileView`). Los correos no se duplican en `user_profiles`. El error de Clerk «That email address is taken» significa que la dirección pertenece a otro usuario de Clerk: no se fusionan ni reasignan cuentas. Sin cambios de autenticación.
- **D4. Varios correos, una cuenta (contrato, ya cumplido; sin cambios de código).** Varios correos verificados del mismo Clerk User ID inician sesión en la misma cuenta y resuelven la misma fila de `app_users`, porque `getActor` busca por `clerk_user_id`. Solo el principal verificado se sincroniza con `app_users.email` (`syncOwnIdentity`, D32 de AUTH-2.2). Añadir correos no crea filas en Neon. Comprobado en Clerk DEV: `auth_email.used_for_sign_in = true` (password y email_code).
- **D5. Diseño.** Se mantienen las tres secciones: Información personal, Correos y Seguridad. Diseño minimalista de Apple (D29 de AUTH-2.2), sin componentes shadcn nuevos.

Decisiones del propietario sobre P1 y P2 (2026-11-08), cerradas:

- **D6. Presentación del tipo (P1).** La fila sigue con la etiqueta "Teléfono" y el valor `<Tipo> · <número>` (por ejemplo `Personal · 987 654 321`, `Trabajo · …` o `Casa · …`). Sin tipo (teléfonos antiguos), solo el número. Sin opciones adicionales.
- **D7. Tipo por defecto (P2).** Al añadir un teléfono, el tipo empieza en Personal. Al editar, empieza en el guardado o, si no hay, en Personal. El tipo es obligatorio al guardar; no hay opción "Sin tipo".

## Requisitos

1. R1 — Normalización del teléfono (`modules/account/utils/phone.ts`, función pura):
   - El número nacional se recorta y se le quitan espacios y `( ) - .`. Si queda algo distinto de dígitos, es inválido. El signo `+` no se admite en el número nacional: el prefijo sale del país.
   - Resultado: `+<prefijo del país><dígitos>`, válido solo si cumple `^\+[1-9]\d{6,14}$`.
   - Número vacío equivale a quitar el teléfono (R31 de AUTH-2.2).
2. R2 — Lectura del teléfono guardado:
   - Formato: celular peruano (`^\+519\d{8}$`) como `987 654 321`. Cualquier otro E.164 se muestra tal cual. El texto libre antiguo se muestra tal cual.
   - Separación para editar: se quitan espacios y `( ) - .` del valor guardado; si empieza por `+` y algún prefijo de la lista de D1 lo inicia, el país es ese y el número nacional es el resto. Si no, el país es Perú y el número nacional es el valor guardado sin cambios. Los prefijos de D1 no son prefijo unos de otros, así que la coincidencia es única.
3. R3 — Validación del campo `phone` (`profile.schema.ts`, la misma en cliente y servidor; el servidor manda):
   - Entrada estricta `{ field: "phone", value: { country, national, type } | null }`. `country` solo admite los códigos de D1 y `type` solo `personal`, `work` o `home`. Las claves extra se rechazan, también dentro de `value`.
   - Salida `{ field: "phone", value: { phone: <E.164>, type } | null }`. `null` o número vacío dan `value: null`.
   - Mensajes en español: "Usa solo dígitos, espacios y ( ) - ." y "Número no válido.".
4. R4 — Validación del sitio web: después de recortar, si el valor no tiene esquema se le antepone `https://`, y si empieza por `//` se le antepone `https:`. "Tiene esquema" significa que empieza por `<letra>[letras, dígitos, + . -]*:` y lo que sigue a los dos puntos no es un puerto (dígitos seguidos de fin, `/`, `?` o `#`). Después siguen `z.httpUrl` y el máximo de 200 caracteres, contados sobre el valor final. Se guarda el valor final.
5. R5 — Persistencia: `profileSchema` añade `phoneType` (`personal | work | home | null`). `getOwnProfile` y todas las sentencias del mapa cerrado leen y devuelven `phone_type`. La sentencia de `phone` escribe `phone` y `phone_type` en la misma sentencia atómica y no escribe ninguna otra columna salvo `updated_at`. Con `value: null`, ambas quedan en `null`. Las sentencias de los otros cinco campos no cambian, salvo el `returning`.
6. R6 — Diálogo del teléfono (`ProfileFieldDialog`):
   - Tres controles con `<label>` visible, en este orden: País (`<select>` nativo, opciones `Perú (+51)` y siguientes), Número (`Input` con `type="tel"`, `inputMode="tel"`, `autoComplete="tel-national"`) y Tipo (`<select>` nativo: Personal, Trabajo, Casa).
   - Valores iniciales según R2 y D7. "Quitar" envía `value: null`.
   - Envía a la acción la entrada sin transformar (`{ field, value: { country, national, type } }`), no la salida del esquema: la transformación no es idempotente. Lo mismo para el resto de campos: valida en el cliente con `safeParse` solo para mostrar el error.
   - El error se asocia al campo Número con `aria-describedby`. Los `<select>` usan los mismos tokens que `Input` y el `textarea` existente (una constante de clases compartida en el archivo), sin colores sueltos.
7. R7 — Fila del teléfono (`ProfileView`): valor según D6 con el formato de R2. Sin teléfono, "Añadir teléfono" como hasta ahora.
8. R8 — Correos (`ProfileView`): los secundarios son los de `user.emailAddresses` distintos del principal y con `verification?.status === "verified"`. Sin principal, solo "Añadir correo" (R30 de AUTH-2.2). Todas las filas siguen abriendo el modal de Clerk.
9. R9 — Migración (`db/migrations/0003_user_profiles_phone_type.sql`): el contenido exacto de "Contratos". La aplica el propietario con `npm run db:migrate` **antes** de ejecutar el código nuevo, porque `getOwnProfile` lee `phone_type`. Ningún agente la ejecuta.
10. R10 — D4 se mantiene: `lib/auth.ts` y `lib/auth.test.ts` no cambian.

## Contratos

Migración `db/migrations/0003_user_profiles_phone_type.sql` (una sola sentencia, sin tocar datos):

```sql
alter table user_profiles add column phone_type text check (phone_type in ('personal','work','home'));
```

`modules/account/utils/phone.ts` (sin `server-only`; lo usan el esquema y la UI):

```ts
export const PHONE_COUNTRIES = [
  { code: "PE", dialCode: "51" }, { code: "AR", dialCode: "54" }, { code: "BO", dialCode: "591" },
  { code: "BR", dialCode: "55" }, { code: "CL", dialCode: "56" }, { code: "CO", dialCode: "57" },
  { code: "EC", dialCode: "593" }, { code: "MX", dialCode: "52" }, { code: "ES", dialCode: "34" },
  { code: "US", dialCode: "1" },
] as const;
export type PhoneCountry = (typeof PHONE_COUNTRIES)[number]["code"];
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = "PE";
export const PHONE_TYPES = ["personal", "work", "home"] as const;
export type PhoneType = (typeof PHONE_TYPES)[number];
export const PHONE_TYPE_LABELS: Record<PhoneType, string>; // Personal, Trabajo, Casa

export function phoneCountryLabel(country: PhoneCountry): string; // "Perú (+51)", con Intl.DisplayNames
export function toE164(country: PhoneCountry, national: string): string | null; // R1; null si inválido
export function splitPhone(stored: string): { country: PhoneCountry; national: string }; // R2
export function formatPhone(stored: string): string; // R2
```

`modules/account/schemas/profile.schema.ts`:
- `PROFILE_FIELD_KEYS` no cambia (seis campos).
- `profileSchema` añade `phoneType: z.enum(PHONE_TYPES).nullable()`.
- `profileFieldInputSchema`: la variante `phone` según R3 y la de `website` según R4. Las demás variantes no cambian.

`modules/account/types/profile.types.ts`:
- `ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number]`, ya no `keyof Profile`, porque `Profile` incluye `phoneType`.
- `ProfileFieldInput = z.input<typeof profileFieldInputSchema>` (lo que envía el cliente).
- `ProfileFieldValue = z.output<typeof profileFieldInputSchema>` (lo que recibe el service).
- `Profile` y `ProfileActionResult` sin cambios de forma, salvo `phoneType` en `Profile`.

`modules/account/services/profile.service.ts`:
- `getOwnProfile(userId: string): Promise<Profile>`: el `select` añade `phone_type`.
- `setOwnProfileField(userId: string, input: ProfileFieldValue): Promise<Profile>`: elige la sentencia en el mapa cerrado por `input.field`. Una clave fuera del mapa lanza `Unknown profile field` sin llamar a la base.
- Sentencia de `phone`:

  ```sql
  insert into user_profiles (user_id, phone, phone_type) values (${userId}, ${phone}, ${type})
  on conflict (user_id) do update set phone = excluded.phone, phone_type = excluded.phone_type, updated_at = now()
  returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note
  ```

  Con `value: null`, `phone` y `type` son `null`.

`modules/account/actions/profile.actions.ts`: `updateProfileFieldAction(input: unknown): Promise<ProfileActionResult>` no cambia de firma ni de controles (R33 de AUTH-2.2). Solo pasa `parsed.data` completo al service.

## Seguridad

- La acción sigue siendo el único punto de entrada: `getActor()`, `dashboard:view`, esquema estricto y escritura solo sobre `actor.id` (R33 de AUTH-2.2, sin cambios).
- `country` y `type` son enumeraciones cerradas en el esquema y `phone_type` tiene `check` en la base. Ningún nombre de columna sale de la entrada (mapa cerrado).
- Sitio web: el prefijo `https://` solo se añade a valores sin esquema, así que `javascript:`, `data:`, `mailto:` y `ftp:` siguen rechazados por `z.httpUrl`. La fila solo enlaza `http(s)://` con `noopener noreferrer nofollow` (sin cambios).
- Teléfono y tipo son datos privados del dueño (D31 de AUTH-2.2): solo `profile.service.ts` toca `user_profiles` y los errores se registran sin valores.
- Correos: la app no escribe en Clerk ni crea, fusiona o reasigna cuentas. Ocultar los secundarios sin verificar es solo presentación: no cambia la autenticación (D3, D4).

## Recuperación

- Código: vive en `feat/profile-contact` sobre `ca27a9b`. Antes de integrarlo, con orden del usuario: `git restore --source ca27a9b --staged --worktree -- modules/account` y borrar `db/migrations/0003_user_profiles_phone_type.sql` y `modules/account/utils/phone*`.
- Base de datos, solo en la rama de desarrollo de Neon y con orden expresa del propietario. Primero se revierte el código (el código nuevo lee `phone_type`) y después:

  ```sql
  alter table user_profiles drop column phone_type;
  delete from schema_migrations where name = '0003_user_profiles_phone_type.sql';
  ```

  Alternativa sin pérdida: restaurar la rama de Neon a un punto anterior.
- Los teléfonos ya normalizados (`+51987654321`) siguen siendo válidos para el código de AUTH-2.2 (≤ 30 caracteres, solo `+` y dígitos), así que revertir el código no exige tocar datos. Solo se pierde el tipo.
- Clerk: sin cambios que deshacer.

## Criterios de aceptación

Todos pertenecen a la fase CONTACT-1.

Automáticos (Reviewer):
- [ ] CA-1 — `modules/account/utils/phone.test.ts` (R1, R2, D1):
  - Lista y orden de D1, con Perú por defecto. `phoneCountryLabel("PE")` es `Perú (+51)` y `phoneCountryLabel("US")` es `Estados Unidos (+1)`.
  - `toE164`: `PE` + `987 654 321` da `+51987654321`; `PE` + `987-654-321` igual; `ES` + `600 123 456` da `+34600123456`; `US` + `(415) 555-2671` da `+14155552671`; `BO` + `71234567` da `+59171234567`. Devuelve `null` con letras, con `+`, con menos de 7 dígitos en total y con más de 15.
  - `formatPhone`: `+51987654321` da `987 654 321`; `+5114261234` (fijo peruano), `+34600123456` y el texto libre `600 12 34 56` se devuelven sin cambios.
  - `splitPhone`: `+51987654321` da `PE` y `987654321`; `+59171234567` da `BO`; `+14155552671` da `US`; el texto antiguo `+34 600 123 456` da `ES` y `600123456`; `600 123 456` y `+447911123456` dan `PE` con el valor sin cambios.
- [ ] CA-2 — `modules/account/schemas/profile.schema.test.ts` (R3, R4; sustituye los casos de teléfono y "sin protocolo" de CA-34 de AUTH-2.2; los demás casos siguen):
  - Teléfono: `{ country: "PE", national: " 987 654 321 ", type: "personal" }` da `{ phone: "+51987654321", type: "personal" }`; un número de otro país da su E.164 sin agrupar; `null` y número vacío o en blanco dan `null`.
  - Teléfono rechazado: letras, `+` en el número nacional, longitud fuera de 7 a 15 dígitos, país `XX`, tipo `mobile`, tipo ausente, clave extra dentro de `value` y clave extra `userId` en la raíz.
  - Sitio web aceptado y normalizado: `example.com` da `https://example.com`; `example.com:8080` da `https://example.com:8080`; `www.example.com/me` da `https://www.example.com/me`; `//example.com` da `https://example.com`; `https://example.com` y `HTTP://example.com` no cambian (sin protocolos duplicados).
  - Sitio web rechazado: `javascript:alert(1)`, `ftp://example.com`, `mailto:a@b.com` y un valor sin esquema de 193 caracteres (201 con `https://`).
- [ ] CA-3 — `modules/account/services/profile.service.test.ts` con `@/lib/db` simulado (R5; los casos de CA-36 de AUTH-2.2 siguen, adaptados a la nueva firma):
  - `getOwnProfile` lee `phone_type` y devuelve `phoneType`; sin fila, todo `null`, incluido `phoneType`.
  - La sentencia de `phone` es una sola, sin `select` previo, y su parte de escritura es exactamente `insert into user_profiles (user_id, phone, phone_type) values ($, $, $) on conflict (user_id) do update set phone = excluded.phone, phone_type = excluded.phone_type, updated_at = now()`, con parámetros `[userId, "+51987654321", "personal"]`.
  - `value: null` envía `[userId, null, null]` y devuelve `phone` y `phoneType` en `null`.
  - Los otros cinco campos siguen escribiendo solo su columna. Cada campo usa su propia sentencia. Todo `returning` incluye `phone_type`. Una clave fuera del mapa lanza sin llamar a la base.
- [ ] CA-4 — Lectura del código:
  - `updateProfileFieldAction` mantiene `getActor()`, `dashboard:view`, `safeParse` estricto y `actor.id`, y solo cambia la llamada al service.
  - `ProfileFieldDialog` envía la entrada sin transformar (R6) y usa `<select>` nativos con `<label>`.
  - `ProfileView` filtra los secundarios con `verification?.status === "verified"` (R8) y presenta el teléfono según D6.
  - `getActor` sigue buscando por `clerk_user_id` (D4).
  - La migración `0003` tiene exactamente la sentencia de "Contratos".
- [ ] CA-5 — Privacidad, incluidos los archivos sin seguimiento: `git grep --untracked -l "user_profiles" -- . ':(exclude)docs'` muestra solo `db/migrations/0002_user_profiles.sql`, `db/migrations/0003_user_profiles_phone_type.sql`, `modules/account/services/profile.service.ts` y `modules/account/services/profile.service.test.ts`. `git grep --untracked -l "phone_type" -- . ':(exclude)docs'` muestra solo `0003`, `profile.service.ts` y su test.
- [ ] CA-6 — Diseño (D5): mismas tres secciones, sin tarjetas nuevas, sin iconos decorativos y sin colores sueltos (mismo criterio que CA-40 de AUTH-2.2). Sin cambios en `components/ui/`.
- [ ] CA-7 — Alcance cerrado de archivos respecto a `ca27a9b`. Verificación en Git Bash desde la raíz del worktree; PASS = sin salida:

  ```sh
  { git diff --name-only --no-renames ca27a9b; git ls-files -o --exclude-standard; } | sort -u | grep -v -x -F \
    -e db/migrations/0003_user_profiles_phone_type.sql \
    -e modules/account/utils/phone.ts -e modules/account/utils/phone.test.ts \
    -e modules/account/schemas/profile.schema.ts -e modules/account/schemas/profile.schema.test.ts \
    -e modules/account/types/profile.types.ts \
    -e modules/account/services/profile.service.ts -e modules/account/services/profile.service.test.ts \
    -e modules/account/actions/profile.actions.ts \
    -e modules/account/components/ProfileView.tsx -e modules/account/components/ProfileFieldDialog.tsx \
    -e docs/specs/account-profile-contact.md -e docs/specs/account-profile-contact.md.sig \
    -e docs/specs/approvals.jsonl \
    -e docs/evidence/account-profile-contact.md
  ```

  Se ejecuta al terminar T1 y T2, y en T3. `docs/evidence/account-profile-contact.md` solo con orden del usuario. La lista solo se amplía editando esta spec y aprobándola de nuevo.
- [ ] CA-8 — Calidad: `npx vitest run`, `npx vitest run .claude/hooks`, `npm run lint` y `npm run build` terminan con código 0. `package.json` y `package-lock.json` no cambian (cubierto por CA-7).

Manuales (propietario, claves de desarrollo, rama de desarrollo de Neon):
- [ ] CA-9 — Migración: dado `0001` y `0002` aplicadas, cuando el propietario ejecuta `npm run db:migrate` dos veces, entonces la primera imprime `SKIP 0001_app_users.sql`, `SKIP 0002_user_profiles.sql` y `OK 0003_user_profiles_phone_type.sql`, y la segunda `SKIP` para las tres. Los teléfonos existentes no cambian.
- [ ] CA-10 — Teléfono peruano: dado el diálogo con Perú (+51) por defecto, cuando se guarda `987654321` con tipo Trabajo, entonces la fila muestra `Trabajo · 987 654 321`; al recargar se conserva y, en Neon, `phone = '+51987654321'` y `phone_type = 'work'`.
- [ ] CA-11 — Otro país: dado el diálogo, cuando se elige España (+34) y se guarda `600 123 456`, entonces la fila muestra `+34600123456` sin agrupar y, al reabrir, el país es España y el número `600123456`.
- [ ] CA-12 — Tipo y quitar: cuando se cambia solo el tipo a Casa, entonces la fila lo refleja sin recargar; cuando se pulsa "Quitar", entonces aparece "Añadir teléfono" y, en Neon, `phone` y `phone_type` quedan en `null`. Un número inválido muestra el error junto al campo sin cerrar el diálogo.
- [ ] CA-13 — Teléfono antiguo: dado un teléfono guardado en texto libre antes de `0003`, entonces se muestra tal cual sin tipo; cuando se edita y guarda, entonces queda en E.164 con tipo.
- [ ] CA-14 — Sitio web: cuando se guarda `example.com`, entonces se guarda y enlaza `https://example.com`; `example.com:8080` da `https://example.com:8080`; `javascript:alert(1)` muestra el error.
- [ ] CA-15 — Correos: dado un correo secundario añadido en el modal de Clerk y aún sin verificar, entonces no aparece en Correos; cuando se verifica y se vuelve a abrir el perfil, entonces aparece.
- [ ] CA-16 — Varios correos, una cuenta (D4): dado un usuario con dos correos verificados, cuando inicia sesión con cada uno, entonces el Clerk User ID es el mismo y `select id, email from app_users where clerk_user_id = '<id>'` devuelve la misma fila única, con el correo principal. El número de filas de `app_users` no cambia al añadir el correo.
- [ ] CA-17 — Accesibilidad y diseño: teclado y foco en los tres controles del diálogo; temas claro y oscuro; 375 px de ancho sin desbordes.

## Diseño técnico

- Rutas (`app/`): ninguna nueva ni modificada. `app/dashboard/profile/page.tsx` sigue llamando a `requirePermission`, `syncOwnIdentity` y `getOwnProfile`.
- Componentes:
  - `modules/account/components/ProfileFieldDialog.tsx`: existente; añade el formulario del teléfono (R6) con `<select>` nativos. Usa `Input`, `Label`, `Button` y `Dialog`, de shadcn y ya instalados.
  - `modules/account/components/ProfileView.tsx`: existente; filtro de correos (R8) y fila del teléfono (R7, D6).
  - Ningún componente nuevo: el `<select>` nativo cubre la necesidad (D5, KISS).
- Utils: `modules/account/utils/phone.ts`, nuevo (R1, R2). Va aparte de `profileFields.ts` porque es lógica de dominio propia (lista de países, normalización y formato) que usan el esquema y la UI. `profileFields.ts` no cambia: la fila del teléfono se pinta aparte en `ProfileView`.
- Schemas, types, service y action: según "Contratos".
- Migración: `db/migrations/0003_user_profiles_phone_type.sql`, nueva. El runner existente (`scripts/db-migrate.mjs`) la aplica en orden de nombre y en su propia transacción.
- Antes de empezar: `npm ls --depth=0` sin errores; `npm ci` solo si falla.

## Reutilización

- Del proyecto: el mapa cerrado y el patrón de tests de `profile.service.ts`; `fieldValue` y `fieldInput` de `profile.schema.ts`; `ProfileFieldDialog` (montaje por apertura, error con `aria-describedby`, "Quitar"); las clases de tokens del `textarea` existente, compartidas con los `<select>`; `Row` y `Group` de `ProfileView`; el runner `db:migrate`; `getActor` y `syncOwnIdentity` sin cambios.
- Plataforma: `<select>` nativo, `Intl.DisplayNames`, `inputMode="tel"`, y `z.httpUrl` de zod v4.
- shadcn: `dialog`, `input`, `label` y `button`, ya instalados. `native-select` y `select` existen en el registro y no se instalan (D5).

## Archivos sensibles

Fase CONTACT-1 (coincide con el patrón sensible del hook; se desbloquea solo con esta spec aprobada y mientras su plan tenga tareas abiertas):

- `db/migrations/0003_user_profiles_phone_type.sql`

Ninguna otra ruta de CA-7 es sensible: `modules/account/*` no contiene `auth`. Se citan sin viñeta y no se desbloquean: `db/migrations/0002_user_profiles.sql`, `lib/auth.ts`, `lib/auth.test.ts`.

## Cambios de gobierno

Ninguno.

## Tests

- `modules/account/utils/phone.test.ts`, nuevo (CA-1).
- `modules/account/schemas/profile.schema.test.ts`, actualizado (CA-2).
- `modules/account/services/profile.service.test.ts`, actualizado (CA-3).
- Sin tests de `ProfileView`, `ProfileFieldDialog` ni de la acción: la lógica con reglas está en `phone.ts`, el esquema y el service, ya probados. La acción solo cambia la llamada al service y se revisa por lectura (CA-4). Los componentes se cubren con CA-4 y CA-10 a CA-17.
- `modules/account/utils/profileFields.test.ts` y `lib/auth.test.ts` no cambian y deben seguir pasando.

## Plan de tareas

### Fase CONTACT-1

- [x] T1 — Migración, datos, validación y servicio:
  - `npm ls --depth=0`; `npm ci` solo si falla.
  - `0003_user_profiles_phone_type.sql` (sin ejecutarla).
  - `phone.ts` y su test; esquema, tipos y service con sus tests; la llamada al service en la acción.
  - `npx vitest run modules/account` y `npx eslint` sobre los archivos tocados; CA-5 y CA-7 al terminar.
  - Archivos: `db/migrations/0003_user_profiles_phone_type.sql`, `modules/account/utils/phone.ts`, `modules/account/utils/phone.test.ts`, `modules/account/schemas/profile.schema.ts`, `modules/account/schemas/profile.schema.test.ts`, `modules/account/types/profile.types.ts`, `modules/account/services/profile.service.ts`, `modules/account/services/profile.service.test.ts`, `modules/account/actions/profile.actions.ts`.
  - Depende de: —. Secuencial (base).
- [x] T2 — Interfaz:
  - Diálogo del teléfono (R6), fila del teléfono (R7, D6) y filtro de correos verificados (R8).
  - `npx eslint` sobre los dos archivos; CA-6 y CA-7 al terminar.
  - Archivos: `modules/account/components/ProfileFieldDialog.tsx`, `modules/account/components/ProfileView.tsx`.
  - Depende de: T1 (usa `phone.ts` y los tipos nuevos). Secuencial.
- [x] T3 — Verificación:
  - El reviewer comprueba CA-1 a CA-8.
  - El propietario aplica la migración (con orden expresa suya) y ejecuta CA-9 a CA-17.
  - Archivos: ninguno (evidencia en `docs/evidence/account-profile-contact.md` solo con orden del usuario).
  - Depende de: T2.

Sin tareas en paralelo: T2 depende de los tipos y utilidades de T1.

## Preguntas abiertas

Ninguna. P1 y P2 quedaron cerradas por el propietario el 2026-11-08 en D6 y D7.
