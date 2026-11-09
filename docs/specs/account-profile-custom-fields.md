# Campos personalizados del perfil (UX-1)

- Módulo: account
- Estado: aprobado
- ID: SPEC-account-profile-custom-fields
- Riesgo: alto (esquema de base de datos y migración, datos personales, concurrencia)
- Ruta: SDD-ADVANCED (disparadores: esquema de base de datos y migraciones; datos personales)
- Fase actual: Fase 1

## Objetivo

Hoy el perfil solo admite los campos fijos de `user_profiles` (teléfono, cargo, empresa, cumpleaños, sitio web, nota). El titular quiere guardar datos propios, como «Ubicación», que el panel no prevé. Esta spec añade hasta 10 campos personalizados (etiqueta y valor) por perfil, creados desde «+ Añadir información» → «Campo personalizado…», con edición, eliminación y orden, y siempre privados del titular.

## Decisiones del propietario y reglas que sustituye

- D-UX1-1 (D1): el campo personalizado es solo del titular. Nadie lo edita administrativamente.
- D-UX1-2 (D3): hasta 10 campos por perfil, con etiqueta, valor, orden, edición y eliminación, en una tabla nueva relacionada con `app_users` (migración `db/migrations/0004_user_profile_custom_fields.sql`). «Ubicación» puede ser un campo personalizado; no se añade columna fija.
- D-UX1-3 (D6): referencia visual Figma `https://www.figma.com/design/ihJfCObzth2fgdsWId9HBK`, pantalla 19, nodo `10:2848`. Ver D-UX1-10 para su estado de verificación.
- D-UX1-4: los campos existentes (`phone`, `jobTitle`, `company`, `birthday`, `website`, `note`) conservan su funcionamiento sin cambios.
- D-UX1-5 (resuelve P-UX1-1): se reservan «Nombre», «Apellido», «Correo» y las seis etiquetas fijas de `PROFILE_FIELD_LABELS` (Teléfono, Cargo, Empresa, Cumpleaños, Sitio web, Nota personal). «Ubicación» se permite como campo personalizado. Los duplicados se validan tras normalizar y sin distinguir mayúsculas (ver RN-03 y «Normalización de etiquetas»).
- D-UX1-6 (resuelve P-UX1-2): el orden se cambia con controles «Subir» y «Bajar» accesibles (botones con `aria-label` con el nombre del campo, deshabilitados en los extremos, foco conservado tras mover, anuncio con `role="status"`). Sin arrastrar y soltar.
- D-UX1-7 (resuelve P-UX1-3): etiqueta y valor son texto de una sola línea (se rechazan `\n` y `\r`); etiqueta de 1 a 40 caracteres, valor de 1 a 200.
- D-UX1-8 (resuelve P-UX1-4): el valor vacío se rechaza en cliente y en servidor, tanto al crear como al actualizar. Eliminar es una acción explícita y separada (botón «Eliminar»). Vaciar el valor ya no elimina.
- D-UX1-9 (resuelve P-UX1-5): las pruebas de componentes usan Testing Library (`@testing-library/react`, ya instalado) con `fireEvent`. Prohibido añadir dependencias (por ejemplo `@testing-library/user-event`) sin autorización expresa del propietario.
- D-UX1-10 (resuelve P-UX1-6): se acepta `docs/specs/users-management-design.md` (fila 19: menú de 240 bajo «+ Añadir información», separador, «Campo personalizado…») como especificación visual versionada. **No hubo verificación en vivo contra Figma (nodo `10:2848`)**: las herramientas de Figma no se usaron al redactar esta spec; no se inspeccionó el diseño.
- D-UX1-11 (ajuste técnico): las mutaciones usan `sql.transaction([...])` de Neon HTTP (lote atómico no interactivo) con cada mutación como UNA sola sentencia SQL autocontenida; `lib/db.ts` no se modifica. Detalle, suposiciones y alternativa descartada en «Atomicidad e integridad».
- Sustituye a **D30** de `docs/specs/auth-clerk-neon.md` solo en «Ubicación y "Campo personalizado" se descartan»: «Campo personalizado» pasa a existir y «Ubicación» sigue sin ser campo fijo (se crea como personalizado). También amenda R30 («+ Añadir información» solo si falta un campo opcional) y R31 (contenido del menú), que ahora admiten «Campo personalizado…».
- **D31 se mantiene** y se extiende a la tabla nueva: solo el dueño lee y escribe, identificado por sesión en el servidor (`getActor()`), nunca por un id de usuario enviado por el navegador. R36 se extiende igual: solo `modules/account/services/profile.service.ts` consulta `user_profile_custom_fields`, siempre filtrado por el id del actor.
- No se editan `docs/specs/auth-clerk-neon.md` ni su `.sig`; esta spec registra la sustitución.

## Alcance y reglas

- Incluye: tabla y migración 0004 (solo el archivo); crear, editar, eliminar y reordenar (subir/bajar) campos personalizados propios; UI desde «+ Añadir información» y filas en «Información personal»; schemas, service y acciones de servidor; tests unitarios, de componente y de integridad contra base desechable (omitidos por defecto).
- No incluye: edición o lectura por administradores o en otra pantalla; columna fija «Ubicación»; tipos de valor distintos de texto; valores multilínea o con enlaces automáticos; arrastrar y soltar; plantillas o sugerencias de etiqueta; confirmación previa al eliminar; auditoría o historial; límite configurable; cambios en campos fijos, en `Profile`, en Clerk o en AUTH-3; cambios en `lib/db.ts` o en `scripts/db-migrate.mjs`; dependencias nuevas; **ejecutar la migración o cualquier prueba contra DEV o PROD**.
- RN-01 (D31, D-UX1-1): solo el titular lee, crea, edita, elimina y reordena sus campos; el servidor usa siempre `actor.id` de `getActor()` y rechaza cualquier id de usuario enviado por el cliente.
- RN-02 (D-UX1-2): máximo 10 campos por perfil, garantizado por PostgreSQL (check de `position` + unique deferrable + bloqueo asesor + insert condicional), nunca solo por el frontend.
- RN-03 etiqueta (D-UX1-5, D-UX1-7): una sola línea; sin caracteres de control ni separadores de línea; se normaliza (trim, espacios internos colapsados a uno, NFC); 1 a 40 caracteres tras normalizar; única por usuario sin distinguir mayúsculas; no puede coincidir con una etiqueta reservada (sin distinguir mayúsculas ni tildes). «Ubicación» se permite.
- RN-04 valor (D-UX1-7): una sola línea; se recorta; sin caracteres de control (incluye `\n`, `\r`) ni separadores de línea Unicode; 1 a 200 caracteres. Se muestra como texto plano escapado, sin enlaces automáticos.
- RN-05 orden (D-UX1-6): la posición es densa (1..N) y el orden de la lista es la posición. Un campo nuevo va al final. «Subir» y «Bajar» intercambian la posición con la vecina; en un extremo no hacen nada y el botón está deshabilitado. Eliminar compacta las posiciones.
- RN-06 vacío (D-UX1-8): cliente y servidor rechazan valor vacío en create y update («Escribe un valor.»). Eliminar es la acción `deleteCustomFieldAction`, disparada solo por el botón «Eliminar».
- RN-07 consistencia (D-UX1-11): cada mutación es un lote `sql.transaction` que toma primero un bloqueo asesor por usuario y ejecuta una sola sentencia de mutación independiente de resultados previos; el lote es atómico (sin escrituras parciales). Los constraints de la base son la red de seguridad.
- RN-08 errores en español, sin datos personales en el cliente ni en los registros del servidor (ver «Fallos»).
- RN-09 permisos: cada acción exige actor activo con `dashboard:view`.
- RN-10 (D-UX1-4): los campos fijos y sus acciones (`updateProfileFieldAction`) no cambian.
- RN-11 accesibilidad del orden (D-UX1-6): «Subir» y «Bajar» son botones con `aria-label` que incluye el nombre del campo, deshabilitados en los extremos; tras mover se conserva el foco y se anuncia el resultado en una región `role="status"`.
- RN-12 seguridad de las pruebas: las pruebas de integridad solo corren contra una base desechable indicada en `DISPOSABLE_DATABASE_URL`, nunca contra DEV ni PROD, y se omiten por defecto.

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| Titular activo (user, admin, superadmin) con `dashboard:view` | Leer, crear, editar, eliminar y reordenar sus campos personalizados | Sí | `actor.id` de `getActor()` |
| Titular | Campo de otro usuario (por id de campo ajeno) | No | La sentencia filtra por `user_id = actor.id`; responde «El campo ya no existe.» |
| Admin o superadmin | Campos personalizados de otro usuario | No | D31, D-UX1-1 |
| Sin sesión, revocado o invitado | Cualquier acción | No | `getActor()` devuelve `null` o falta el permiso |
| Cliente | Enviar `userId` u otras claves | No | `z.strictObject` rechaza claves extra |

## Diseño y dependencias

Sin rutas nuevas: `/dashboard/profile` ya existe y solo compone.

| Pieza | Ruta | Origen |
|---|---|---|
| Página | `app/dashboard/profile/page.tsx` | existente; añade la lectura de campos personalizados y los pasa a `ProfileView` |
| Vista | `modules/account/components/ProfileView.tsx` | existente; filas de campos personalizados tras los opcionales, entrada «Campo personalizado…» en el menú y región `role="status"` |
| Diálogo | `modules/account/components/ProfileFieldDialog.tsx` | existente; se reutiliza su carcasa (`Dialog`, `finalFocus`, "mount on open"). Recibe la prop opcional `custom` y, si está, renderiza `CustomFieldForm` en lugar de `FieldForm`; sin `custom` se comporta igual que hoy |
| Formulario | `modules/account/components/CustomFieldForm.tsx` | nuevo: etiqueta, valor, Subir/Bajar, Eliminar y Guardar tienen otro contrato (id, 4 acciones) y meterlos en `FieldForm` mezclaría la rama del teléfono con otra; reutiliza el mismo `Dialog` mediante `ProfileFieldDialog` |
| `Input`, `Label`, `Button`, `Dialog`, `DropdownMenu`, `DropdownMenuSeparator` | `components/ui/*` | shadcn (instalado); no se instala nada |
| Iconos `ChevronUp`, `ChevronDown` (lucide-react) | — | instalado |
| Schemas, tipos | `modules/account/schemas/profile.schema.ts`, `types/profile.types.ts` | existentes, ampliados |
| Service | `modules/account/services/profile.service.ts` | existente, ampliado |
| Acciones | `modules/account/actions/profile.actions.ts` | existente, ampliado (4 acciones) |
| Lectura para la página | `modules/account/server.ts` | existente; exporta también `getOwnCustomFields` |

- `modules/account/index.ts` no cambia (`ProfileView` ya se exporta; las acciones se importan dentro del módulo).
- Sin dependencias nuevas (D-UX1-9). `lib/db.ts` y `scripts/db-migrate.mjs` no se modifican.

### UI (desde «+ Añadir información»)

- Menú (`w-60`, igual que hoy): los campos opcionales faltantes, y si `customFields.length < 10`, un `DropdownMenuSeparator` y «Campo personalizado…». El menú se muestra si hay algún opcional faltante o si hay cupo; con 10 campos y sin opcionales faltantes se oculta como ahora.
- Si solo hay cupo y no faltan opcionales, el menú contiene únicamente «Campo personalizado…» (sin separador sobrante).
- «Campo personalizado…» abre el diálogo vacío: título «Añadir campo personalizado», entradas «Etiqueta» y «Valor», «Cancelar» y «Guardar».
- Cada campo personalizado es una fila de «Información personal» (etiqueta a la izquierda, valor a la derecha, chevron) después de los campos opcionales fijos y en orden de posición. Al abrirla, el diálogo muestra título «Editar campo personalizado», valores actuales, «Eliminar» (acción explícita, sin confirmación) y los botones «Subir» y «Bajar».
- Subir/Bajar: botones con icono y `aria-label` «Subir «<etiqueta>»» / «Bajar «<etiqueta>»» (la etiqueta es la guardada, no el borrador), `disabled` en el primero (Subir) y el último (Bajar). Mueven en el servidor de inmediato, sin guardar el borrador; el diálogo sigue abierto y la fila se reordena detrás. Mientras la acción está en curso los botones se deshabilitan. Tras mover, el foco queda en el botón pulsado; si ese botón pasa a deshabilitado (el campo llegó a un extremo), el foco pasa al botón opuesto. Se anuncia en una región `role="status"` (visible u `sr-only`) ««<etiqueta>» movido a la posición N de M»; los errores de mover se anuncian en ella y se muestran junto a los controles.
- Guardar con valor vacío (nuevo o existente) no llama al servidor y muestra «Escribe un valor.» junto al campo.
- Errores en español junto al campo; el diálogo sigue abierto y conserva lo escrito (como R31). El valor se renderiza como texto React (escapado), nunca como enlace.
- Validación en cliente con los mismos schemas (la misma regla que servidor); el servidor es la autoridad. Se envía la entrada cruda, no `parsed.data`, como en `FieldForm`.

## Contratos y datos

### Migración `db/migrations/0004_user_profile_custom_fields.sql` (nueva, solo aditiva; solo se crea el archivo, no se ejecuta)

```sql
create table user_profile_custom_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  label text not null check (
    char_length(label) between 1 and 40
    and label = btrim(label)
    and label !~ '[[:cntrl:]]'
    and label !~ '\s\s'
  ),
  value text not null check (
    char_length(value) between 1 and 200
    and value = btrim(value)
    and value !~ '[[:cntrl:]]'
  ),
  position smallint not null check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profile_custom_fields_position_key
    unique (user_id, position) deferrable initially immediate
);

create unique index user_profile_custom_fields_label_key
  on user_profile_custom_fields (user_id, lower(label));
```

- FK a `app_users(id)` y no a `user_profiles(user_id)`: la fila de `user_profiles` se crea con el primer campo fijo, así que un titular sin ella no podría guardar campos personalizados. Con `on delete cascade` (igual que `0002`) borrar el usuario borra sus campos.
- `unique (user_id, position)` con `check (position between 1 and 10)` hace imposible tener más de 10 filas por usuario aunque falle la lógica de aplicación o el bloqueo. `deferrable initially immediate` hace que PostgreSQL compruebe la unicidad al final de cada sentencia y no fila a fila, lo que permite el intercambio y la compactación dentro de una sola sentencia (ver «Atomicidad e integridad»).
- `unique (user_id, lower(label))` es un índice único de expresión (un `constraint` no admite expresiones).
- Índices: el `unique (user_id, position)` cubre la lectura ordenada por usuario y el índice de etiqueta cubre las colisiones. No se añade otro (YAGNI).
- Los `check` de `btrim`, longitud, control y espacios dobles son la red de seguridad (una sola línea); la normalización real y NFC los hace zod.
- No altera tablas existentes. El runner `scripts/db-migrate.mjs` ejecuta cada archivo completo en una transacción (Client WebSocket); aplicarlo es decisión expresa del propietario, ningún agente lo ejecuta.
- Reversión (manual, solo por orden expresa, sin script en el repo): `drop table user_profile_custom_fields;`. Borra los campos personalizados guardados; el código anterior no depende de la tabla.

### Normalización de etiquetas

Una sola función en `profile.schema.ts` produce la etiqueta guardada y las claves de comparación:

1. Rechazar si contiene `\p{Cc}`, `\p{Zl}` o `\p{Zp}` (incluye `\n`, `\r`, tabulador).
2. Normalizar: `trim()`, colapsar espacios internos (`/\s+/g` → un espacio) y `normalize("NFC")`. El resultado es lo que se valida (1..40) y se guarda.
3. Clave de duplicado propio: `toLowerCase()` de la etiqueta normalizada. No se quitan tildes: «Ubicación» y «Ubicacion» son etiquetas distintas.
4. Clave de reservadas: `normalize("NFD")`, quitar marcas `\p{M}` y `toLowerCase()`; se compara con las reservadas procesadas igual.

Coherencia con la base: lo guardado ya está en NFC, recortado y con espacios únicos, así que `lower(label)` del índice compara el mismo texto que la clave de duplicado del paso 3. Los `check` de la tabla refuerzan trim, espacios dobles y control. Diferencia conocida: `lower()` de PostgreSQL depende de la colación y puede diferir de `toLowerCase()` de JS en casos Unicode especiales (por ejemplo `İ` o sigma final). Por eso **la base es la última barrera**: lo que el servidor considere distinto pero el índice considere igual produce `23505`, que el service traduce (ver «Service»). Las reservadas son solo de aplicación (no hay tabla de reservadas en la base).

### Tipos y schemas (`profile.schema.ts`, `profile.types.ts`)

```ts
// Respuesta al cliente: el orden del array es el orden de posición.
type CustomField = { id: string; label: string; value: string };
type CustomFieldsActionResult =
  | { ok: true; customFields: CustomField[] }
  | { ok: false; error: string };

// Constantes exportadas
const MAX_CUSTOM_FIELDS = 10;
const RESERVED_LABELS: readonly string[]; // PROFILE_FIELD_LABELS + "Nombre", "Apellido", "Correo"

// zod v4, estrictos
customFieldSchema            // z.object({ id: z.uuid(), label: z.string(), value: z.string() })
addCustomFieldInputSchema    // z.strictObject({ label, value })
updateCustomFieldInputSchema // z.strictObject({ id: z.uuid(), label, value })
deleteCustomFieldInputSchema // z.strictObject({ id: z.uuid() })
moveCustomFieldInputSchema   // z.strictObject({ id: z.uuid(), direction: z.enum(["up", "down"]) })
// label: normalización de arriba, luego .min(1, "Escribe una etiqueta.").max(40, "Máximo 40 caracteres.")
//        + sin control/Zl/Zp ("La etiqueta debe ser de una sola línea.") + no reservada ("Esa etiqueta ya existe en tu perfil. Usa otra.")
// value: z.string().trim().min(1, "Escribe un valor.").max(200, "Máximo 200 caracteres.")
//        + sin control/Zl/Zp ("El valor debe ser de una sola línea.")
```

`profileSchema`, `PROFILE_FIELD_KEYS` y `profileFieldInputSchema` no cambian. El orden de las comprobaciones del valor es: control (antes de recortar, para que `"a\n"` no pase por trim), vacío, longitud.

### Service (`profile.service.ts`)

```ts
type CustomFieldsServiceResult =
  | { ok: true; customFields: CustomField[] }
  | { ok: false; reason: "limit" | "duplicate_label" | "not_found" | "conflict" };

getOwnCustomFields(userId: string): Promise<CustomField[]>;
addOwnCustomField(userId: string, input: { label: string; value: string }): Promise<CustomFieldsServiceResult>;
updateOwnCustomField(userId: string, input: { id: string; label: string; value: string }): Promise<CustomFieldsServiceResult>;
deleteOwnCustomField(userId: string, id: string): Promise<CustomFieldsServiceResult>;
moveOwnCustomField(userId: string, id: string, direction: "up" | "down"): Promise<CustomFieldsServiceResult>;
```

Cada mutación es `sql.transaction([lock, mutation, list])`, tres sentencias en una sola petición HTTP y una sola transacción. La mutación **no usa resultados de las otras sentencias** y no hay lógica de aplicación entre ellas; el service solo interpreta los resultados al volver:

1. `lock`: `select pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`. Efecto secundario puro. Serializa las mutaciones del mismo usuario hasta el fin del lote (el bloqueo `xact` se libera al terminar la transacción). Una colisión de hash entre usuarios solo añade espera.
2. `mutation`: UNA sentencia SQL autocontenida, siempre con `user_id = ${userId}`; ninguna columna sale de la entrada salvo valores parametrizados:
   - add: `insert into user_profile_custom_fields (user_id, label, value, position) select ${userId}, ${label}, ${value}, count(*) + 1 from user_profile_custom_fields where user_id = ${userId} having count(*) < 10 returning id`. Cero filas = `limit`. Contar y decidir ocurre dentro de la misma sentencia (CTE implícito), no en la aplicación.
   - update: `update ... set label = ${label}, value = ${value}, updated_at = now() where id = ${id} and user_id = ${userId} returning id`. Cero filas = `not_found`. No cambia `position`.
   - delete: `with d as (delete from ... where id = ${id} and user_id = ${userId} returning position), u as (update ... set position = position - 1, updated_at = now() where user_id = ${userId} and position > (select position from d)) select count(*)::int as deleted from d`. `deleted = 0` = `not_found`. Las CTE de modificación se ejecutan aunque no se lean; `u` ve el snapshot previo al borrado y la unicidad se comprueba al final de la sentencia (deferrable).
   - move: una sola sentencia que decide en SQL: `with t as (select id, position as p from ... where id = ${id} and user_id = ${userId}) update ... set position = case when id = (select id from t) then position + ${delta} else position - ${delta} end, updated_at = now() where user_id = ${userId} and position in ((select p from t), (select p from t) + ${delta})`, con `delta` = `-1` (up) o `1` (down) tomado de un mapa cerrado a partir de `direction`. Si no hay vecina (extremo), el `where` solo coincide con una fila y la sentencia debe convertirse en no-op: se añade `and (select count(*) from ... where user_id = ${userId} and position = (select p from t) + ${delta}) = 1`. Si el id no existe o es ajeno, `t` está vacío y no cambia nada; el service lo detecta porque el id no aparece en la lista (paso 3) y devuelve `not_found`. Dos filas cambian de posición en la misma sentencia: al ser la unicidad `deferrable initially immediate`, se comprueba al final de la sentencia, cuando ya no hay duplicados.
3. `list`: `select id, label, value from ... where user_id = ${userId} order by position`. Es el estado final dentro de la misma transacción; si falla, el lote entero revierte (no hay fallo parcial).

- Violación `unique` (`23505`) pese al bloqueo (red de seguridad, o diferencia `lower()` PG vs JS): el service lee la lista fuera del lote; si ya existe una etiqueta con la misma clave (paso 3 de la normalización), `duplicate_label`; si no, `conflict`. No depende del nombre del constraint. Cualquier otro error se relanza (la acción devuelve el error genérico).
- La carrera de dos altas con etiqueta repetida la resuelve el índice único: una gana, la otra recibe `duplicate_label`.

### Atomicidad e integridad (D-UX1-11)

**Decisión: compatible.** El diseño `sql.transaction([lock, mutación, lista])` es compatible con el cliente `neon()` HTTP de `lib/db.ts` (`NeonQueryFunction<false,false>`) porque Neon HTTP ofrece transacciones **no interactivas**: un lote de sentencias en una sola petición HTTP, atómico, sin lógica de aplicación entre sentencias y sin pasar el resultado de una a otra. El diseño cumple esas condiciones: el lock es un efecto secundario sin salida usada; cada mutación es una sola sentencia que lee y decide en SQL (CTE, `having`, `case`); la lista final no depende de la mutación en sí. No se necesita `Pool`/`Client` por WebSocket, así que **no se toca `lib/db*`** (ruta sensible) ni se añade dependencia de WebSocket en tiempo de ejecución del servidor.

Estado de verificación (este worktree no tiene `node_modules`; nada de lo siguiente se ha comprobado en el paquete ni en una base):

| Punto | Naturaleza | Se probará en |
|---|---|---|
| S1: `sql.transaction([...])` envía el lote en una petición y lo ejecuta en una sola transacción | Suposición documentada de Neon | I-07 |
| S2: un error en cualquier sentencia revierte todo el lote (incluidas las escrituras previas) | Suposición documentada de Neon | I-07 |
| S3: el array de resultados conserva el orden de las sentencias | Suposición documentada de Neon | pruebas unit + I-05 |
| S4: lock y sentencias comparten sesión y transacción (el bloqueo asesor protege la mutación) y el aislamiento por defecto es READ COMMITTED, de modo que la mutación ve las filas confirmadas por el titular anterior del lock | Suposición documentada de Neon y de PostgreSQL | I-05, I-06 |
| S5: `unique ... deferrable initially immediate` se comprueba al final de la sentencia (intercambio y compactación válidos en una sola sentencia) | Comportamiento documentado de PostgreSQL | I-04 |
| S6: `select ... having count(*) < 10` sin `group by` devuelve cero filas si no hay cupo | Comportamiento documentado de PostgreSQL | I-02, I-05 |

Si alguna prueba de la base desechable contradice S1 a S4, el diseño de lote no es válido y hay que pasar a la alternativa (nueva spec o enmienda; no se improvisa en implementación).

**Tope de 10 garantizado por PostgreSQL:** (1) `check (position between 1 and 10)` + `unique (user_id, position)` impiden una fila 11 y dos filas con la misma posición, incluso por SQL directo; (2) el insert condicional (`having count(*) < 10`) calcula la posición `count(*)+1` en la sentencia; (3) el bloqueo asesor serializa altas del mismo titular, así que bajo concurrencia entran exactamente las que caben. Sin el bloqueo, las altas simultáneas fallarían por `23505` (`conflict`) pero nunca superarían 10.

**Intercambio y compactación con el unique deferrable:** al ser `deferrable initially immediate`, la restricción se verifica al terminar cada sentencia, no fila a fila. El `update` de intercambio pasa momentáneamente por dos filas con la misma posición dentro de la sentencia, pero al final son 1..N distintas; lo mismo vale para el `update` de compactación (`position - 1` mientras la fila borrada ya no existe). Una restricción no deferrable se comprobaría por fila y fallaría.

**Alternativa descartada: transacción interactiva con `Pool` por WebSocket** (begin, `select ... for update`, lógica en la aplicación, commit) en un helper nuevo en `lib/db*`. Impacto: cambio en `lib/db*` (ruta sensible: entraría en «Archivos sensibles» y exigiría autorización), dependencia de WebSocket en el servidor (Node >= 22 global o `ws`), gestión de conexiones en un entorno serverless (abrir y cerrar por petición, latencia de varias idas y vueltas) y más superficie de pruebas. Solo se adoptaría si la base desechable refuta S1 a S4; en ese caso se haría en otra fase con spec propia y `Fase actual` distinta.

**Alternativa intermedia descartada:** función SQL (`create function`) que encapsule cada mutación: añadiría objetos a la migración y una indirección sin ventaja frente a una sentencia CTE.

### Acciones (`profile.actions.ts`, `"use server"`)

```ts
addCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult>;
updateCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult>;
deleteCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult>;
moveCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult>;
```

Cada una: `getActor()`; sin actor o sin `can(actor.role, "dashboard:view")` devuelve el error genérico sin tocar la base; valida con su schema estricto (el mensaje del primer issue de `label` o `value`, o «Datos no válidos.»; el valor vacío en `add` y `update` devuelve «Escribe un valor.»); llama al service solo con `actor.id`; traduce `reason`; captura errores y devuelve siempre el error genérico sin estado intermedio.

| `reason` o error | Mensaje al cliente |
|---|---|
| `limit` | «Ya tienes 10 campos personalizados. Elimina uno para añadir otro.» |
| `duplicate_label` | «Ya tienes un campo con esa etiqueta.» |
| `not_found` | «El campo ya no existe.» |
| `conflict` | «No se pudo guardar por un cambio simultáneo. Inténtalo de nuevo.» |
| error inesperado, sin sesión o sin permiso | «No se pudo guardar. Inténtalo de nuevo.» |

Sin `revalidatePath`: el cliente reemplaza su lista con `customFields` (igual que R33).

## No funcionales

- Privacidad: etiqueta y valor son datos personales. Se registra solo el `code` del error (por ejemplo `23505`), nunca `message`: el mensaje de Postgres puede incluir el valor de la etiqueta. Ni ids de campo ni valores en logs.
- Rendimiento: tope de 10 filas por usuario; lecturas por índice; una ida y vuelta por mutación (lote de Neon). El bloqueo asesor es por usuario, sin contención entre usuarios.
- Seguridad de pruebas: ninguna prueba ni migración se ejecuta contra DEV o PROD (RN-12).
- Sin auditoría ni historial (fuera de alcance).

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| IDOR: id de campo ajeno | `where id and user_id = actor.id` devuelve 0 filas | `not_found`, mismo mensaje que si no existiera | Ninguna |
| `userId` enviado por el cliente | `z.strictObject` | «Datos no válidos.» sin tocar la base | Ninguna |
| Sin sesión, revocado o sin permiso | `getActor()` null o `can` falso | Error genérico | Iniciar sesión |
| Altas simultáneas al límite (por ejemplo 12 con 0 campos) | Bloqueo asesor; red: check + unique + `23505` | Entran exactamente las que caben (10, posiciones 1..10); las demás reciben `limit` (o `conflict` en la red) | Reintentar |
| Dos altas con la misma etiqueta | Índice único | `duplicate_label` | Cambiar etiqueta |
| Borrados o movimientos simultáneos | Bloqueo asesor; red: `unique` y `check` | Serializados; en la red, `conflict` | Reintentar; el estado queda consistente |
| Fallo a mitad del lote (mutación o lectura) | Excepción en `sql.transaction` | Rollback de todo el lote; error genérico, sin lista | Reintentar; el cliente conserva su lista anterior |
| Intento de saltarse el tope o el orden por SQL directo | `check` y `unique` | Error de la base (`23514`/`23505`) | Ninguna |
| Pestaña desactualizada (campo ya borrado) | `not_found` | «El campo ya no existe.» | Recargar |
| Valor con HTML o `javascript:` | — | Se muestra como texto escapado, sin enlace | Ninguna |
| Migración falla a medias | El script de migraciones detiene la ejecución | Tabla no creada o creada vacía; el código nuevo no se despliega sin ella | Revertir con `drop table user_profile_custom_fields;` solo por orden expresa y reintentar |
| Despliegue de código antes que la migración | Error de relación inexistente al leer | `page.tsx` falla al cargar campos | Aplicar 0004 antes de desplegar (la migración es aditiva y el código anterior la ignora) |
| Rollback del código | — | El código anterior no usa la tabla | Los datos quedan en la tabla sin efecto |
| Borrado del usuario | `on delete cascade` | Se borran sus campos | Fuera de alcance recuperar |
| Prueba de integridad apuntando a DEV o PROD | Guarda del archivo de pruebas | Aborta con error antes de abrir conexión | Corregir `DISPOSABLE_DATABASE_URL` |

## Criterios de aceptación

Todos pertenecen a la Fase 1 y están pendientes.

- [ ] AC-01 (RN-01, RN-09) Dado un titular con sesión y `dashboard:view`, cuando añade un campo personalizado válido, entonces se guarda en su cuenta y aparece como fila al final de «Información personal» sin recargar.
- [ ] AC-02 (RN-01, negativo) Dado un cliente que envía `userId` u otra clave extra en cualquiera de las cuatro acciones, cuando se ejecuta, entonces se rechaza con «Datos no válidos.» y no se llama al service.
- [ ] AC-03 (RN-01, RN-09, negativo) Dado que `getActor()` devuelve `null` o un rol sin `dashboard:view`, cuando se llama a cualquier acción, entonces devuelve el error genérico y no consulta la base.
- [ ] AC-04 (RN-01, negativo) Dado el id de un campo de otro usuario, cuando se edita, elimina o mueve, entonces la respuesta es «El campo ya no existe.» y el campo ajeno no cambia.
- [ ] AC-05 (RN-01, negativo) Dado un admin o superadmin, cuando abre su perfil o cualquier pantalla del panel, entonces nunca ve campos de otro usuario ni existe ruta o acción que los lea por otro id.
- [ ] AC-06 (RN-02) Dado un perfil con 10 campos, cuando intenta añadir otro, entonces se rechaza con «Ya tienes 10 campos personalizados…» y el menú no ofrece «Campo personalizado…».
- [ ] AC-07 (RN-02, negativo) Dadas 12 altas concurrentes del mismo titular sin campos previos, cuando terminan, entonces hay exactamente 10 filas con posiciones 1..10 sin huecos ni duplicados y las otras 2 reciben el error de límite; y un insert directo por SQL que intente la fila 11 o repetir una posición falla por `check` o `unique`.
- [ ] AC-08 (RN-03) Dada una etiqueta con espacios alrededor o repetidos dentro, cuando se guarda, entonces se guarda recortada, con espacios colapsados y en NFC; una de 41 caracteres o con caracteres de control se rechaza.
- [ ] AC-09 (RN-03, negativo) Dada la etiqueta «teléfono», «CARGO», «Sitio Web», «Correo», «Nombre» o «Apellido» (con o sin tildes y en cualquier combinación de mayúsculas), cuando se guarda, entonces se rechaza con «Esa etiqueta ya existe en tu perfil. Usa otra.»; «Ubicación» se acepta.
- [ ] AC-10 (RN-03, negativo) Dadas «Ubicación» y « ubicación » (o con espacios dobles, o NFD) en el mismo perfil, cuando se guarda la segunda, entonces recibe «Ya tienes un campo con esa etiqueta.»; la comparación del servidor y el índice único `(user_id, lower(label))` coinciden, y si difieren, la base rechaza con `23505`.
- [ ] AC-11 (RN-04) Dado un valor de 200 caracteres, cuando se guarda, entonces se acepta; de 201, vacío, con `\n` o con `\r` se rechaza, en cliente y en servidor.
- [ ] AC-12 (RN-04, negativo) Dado el valor `<img src=x onerror=alert(1)>` o `javascript:alert(1)`, cuando se muestra, entonces aparece como texto sin interpretarse y sin enlace.
- [ ] AC-13 (RN-05) Dados 3 campos, cuando el titular baja el primero, entonces el orden pasa a 2.º, 1.º, 3.º y persiste tras recargar; subir el primero o bajar el último no cambia nada y sus botones están deshabilitados.
- [ ] AC-14 (RN-05) Dados 4 campos, cuando elimina el 2.º, entonces los demás quedan en posiciones 1..3 sin huecos y un alta posterior queda cuarta.
- [ ] AC-15 (RN-06) Dado un campo nuevo o existente, cuando se envía con valor vacío (cliente o servidor, create o update), entonces se rechaza con «Escribe un valor.» y el campo no cambia; dado un campo existente, cuando el titular pulsa «Eliminar», entonces se elimina mediante `deleteCustomFieldAction`.
- [ ] AC-16 (RN-07) Dados borrados, movimientos e intercambios concurrentes del mismo titular, cuando terminan, entonces las posiciones siguen siendo 1..N sin huecos ni duplicados.
- [ ] AC-17 (RN-07) Dado un fallo en la lectura final o en la sentencia, cuando falla el lote, entonces no queda ningún cambio parcial (la acción devuelve el error genérico sin lista) y, en la base desechable, un lote con una escritura válida y una sentencia que falla deja 0 filas escritas.
- [ ] AC-18 (RN-08) Dado un error de base de datos, cuando se registra, entonces el log contiene solo `code` y nunca etiqueta, valor ni `message`; el cliente recibe un mensaje en español.
- [ ] AC-19 (RN-10) Dado el perfil con campos fijos y personalizados, cuando el titular edita teléfono, cargo, empresa, cumpleaños, sitio web o nota, entonces siguen funcionando como antes y no modifican los personalizados (y viceversa); `Profile` y `updateProfileFieldAction` no cambian.
- [ ] AC-20 (UI) Dado el menú «+ Añadir información», cuando faltan opcionales y hay cupo, entonces lista los opcionales, un separador y «Campo personalizado…»; con cupo y sin opcionales faltantes solo aparece «Campo personalizado…»; sin cupo ni opcionales faltantes no se muestra el menú.
- [ ] AC-21 (UI) Dado un error del servidor, cuando falla guardar, entonces el diálogo sigue abierto, conserva lo escrito y muestra el error junto al campo.
- [ ] AC-22 (migración) Dada una base desechable autorizada, cuando se aplica 0004, entonces la tabla existe con FK `on delete cascade`, `unique (user_id, position)` deferrable, índice único `(user_id, lower(label))` y checks; no cambia ninguna tabla existente. Solo con autorización expresa del propietario.
- [ ] AC-23 (calidad) `npx vitest run` sobre los archivos del módulo `account` tocados (con las pruebas de integridad omitidas) y `npx eslint` sobre ellos pasan; el reviewer ejecuta `npm run build` y `npm run lint` sin errores; `package.json` y el lockfile no cambian.
- [ ] AC-24 (RN-11, a11y) Dado el diálogo de un campo existente, cuando se renderiza, entonces «Subir» y «Bajar» son botones con `aria-label` que contiene el nombre del campo, están deshabilitados en los extremos y, tras activar uno, el foco se conserva (o pasa al botón opuesto si el pulsado queda deshabilitado) y una región `role="status"` anuncia la nueva posición.
- [ ] AC-25 (RN-12) Dado que `DISPOSABLE_DATABASE_URL` no está definida, cuando se ejecuta `npx vitest run`, entonces el archivo de integridad se omite; dado que está definida y coincide con `DATABASE_URL` o `DATABASE_URL_UNPOOLED`, o contiene su host, entonces el archivo falla antes de abrir conexión.
- [ ] AC-26 (UI, RN-06) Dado el formulario de campo personalizado, cuando el valor está vacío y se pulsa «Guardar», entonces se muestra «Escribe un valor.» y no se llama a ninguna acción de servidor.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | `getActor()`, `where user_id = actor.id`, `z.strictObject` | AC-01..AC-05 | `profile.actions.test.ts`, `profile.service.test.ts`, I-01, manual M-04 |
| RN-02 | `check (position between 1 and 10)`, `unique (user_id, position)`, `having count(*) < 10`, bloqueo asesor | AC-06, AC-07 | `profile.service.test.ts`, I-02, I-05 |
| RN-03 | `label` check, índice único `lower(label)`, `RESERVED_LABELS`, normalización | AC-08, AC-09, AC-10 | `profile.schema.test.ts`, `profile.service.test.ts`, I-03, manual M-06 |
| RN-04 | `value` check, schema | AC-11, AC-12 | `profile.schema.test.ts`, `CustomFieldForm.test.tsx`, I-03, manual M-06 |
| RN-05 | `position` densa, sentencias move y delete, deferrable | AC-13, AC-14 | `profile.service.test.ts`, I-04, I-06, manual M-02 |
| RN-06 | schemas, `CustomFieldForm`, `deleteCustomFieldAction` | AC-15, AC-26 | `profile.schema.test.ts`, `profile.actions.test.ts`, `CustomFieldForm.test.tsx`, manual M-03 |
| RN-07 | `sql.transaction`, bloqueo asesor, sentencia única, `deferrable` | AC-16, AC-17 | `profile.service.test.ts`, `profile.actions.test.ts`, I-05, I-06, I-07 |
| RN-08 | logs solo con `code` | AC-18, AC-21 | `profile.actions.test.ts`, `CustomFieldForm.test.tsx` |
| RN-09 | `can(actor.role, "dashboard:view")` | AC-01, AC-03 | `profile.actions.test.ts` |
| RN-10 | `profile.schema.ts` y acción de campos fijos intactos | AC-19 | tests existentes de `profile.*.test.ts` sin cambios + manual M-05 |
| RN-11 | `CustomFieldForm`, región `role="status"` | AC-24 | `CustomFieldForm.test.tsx`, manual M-07 |
| RN-12 | guarda y `skipIf` del archivo de integridad | AC-25 | revisión del reviewer + ejecución sin variable (omitido) |
| (UI/menú) | `ProfileView` | AC-20 | manual M-01 (sin test unitario obligatorio) |
| (migración) | 0004 | AC-22 | I-01..I-04 (con autorización) |
| (calidad) | — | AC-23 | `vitest`, `eslint`, `build` |

## Matriz de pruebas

| Cambio | Unit | Integración (base desechable) | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Esquema 0004 | Validaciones zod | Constraints, FK, deferrable y transacciones (I-01..I-07) | Flujo completo | Acceso por dueño (IDOR) | Solo en base desechable y con autorización expresa; nunca DEV ni PROD |
| CRUD y orden de campos | Schemas, service con `sql` mockeado, acciones, `CustomFieldForm` (Testing Library) | I-02, I-04..I-07 | Feliz y negativo (M-01..M-07) | IDOR, rol revocado, sin sesión | Sí, solo con autorización |

### Pruebas unitarias (Vitest, junto al archivo; sin red ni base)

- `modules/account/schemas/profile.schema.test.ts` (ampliado): etiqueta válida, recortada, con espacios colapsados y NFC (NFD de entrada produce la misma etiqueta); vacía, 41 y control rechazadas; `\n`, `\r` y separadores Unicode rechazados en etiqueta y valor; reservadas con variantes de mayúsculas y tildes («teléfono», «CARGO», «Sitio Web», «Correo», «Nombre», «Apellido»); «Ubicación» aceptada; «Ubicación» frente a «ubicacion» no son duplicados por sí mismas; valor 200 vs 201, vacío (en add y update), con `\n`/`\r`; `id` no uuid; `direction` fuera de `up`/`down`; clave extra (`userId`) rechazada en los cuatro schemas.
- `modules/account/services/profile.service.test.ts` (ampliado, `sqlMock.transaction` mockeado, sin SQL real): cada mutación envía lock + sentencia + lista, en ese orden, con el `userId` y nunca otro; `limit` con cero filas en el alta; `not_found` con cero filas en update/delete y con id ausente en move; **swap**: `up` y `down` envían el delta `-1`/`1` correcto, la lista devuelta refleja el nuevo orden, y en los extremos (primero con `up`, último con `down`) devuelve `ok` con la lista sin cambios y sin error; **compactación**: tras `delete` la lista devuelta mapea posiciones 1..N sin huecos y `deleted = 0` da `not_found`; **atomicidad**: si `sqlMock.transaction` rechaza, el service relanza, no se emite ninguna sentencia posterior ni lectura aparte, y la acción (en `profile.actions.test.ts`) devuelve el error genérico sin `customFields`; **23505**: con etiqueta existente (misma clave) da `duplicate_label`, sin ella `conflict`; otro error se relanza; mapeo de filas a `CustomField`; `getOwnCustomFields` ordenado.
- `modules/account/actions/profile.actions.test.ts` (nuevo): sin actor, sin `dashboard:view`, clave extra y `userId` no llegan al service; usa `actor.id` y no un id del cliente; valor vacío en add/update devuelve «Escribe un valor.» sin llamar al service; traducción de cada `reason`; error del service (rechazo simulado) devuelve el mensaje genérico; el log contiene solo `code`.
- `modules/account/components/CustomFieldForm.test.tsx` (nuevo, Testing Library con `fireEvent`, sin `user-event`; acciones mockeadas): valor vacío muestra «Escribe un valor.» sin llamar a la acción; «Eliminar» llama a `deleteCustomFieldAction`; error del servidor deja el diálogo con lo escrito; «Subir»/«Bajar» con `aria-label` con el nombre del campo, deshabilitados en los extremos, foco tras mover (y paso al botón opuesto si se deshabilita), anuncio en `role="status"`. Los componentes `ProfileView` y `ProfileFieldDialog` no requieren tests unitarios obligatorios.

### Pruebas de integridad de datos (I-xx): `modules/account/services/profile.service.integrity.test.ts`

Archivo separado, **omitido por defecto**: `describe.skipIf(!process.env.DISPOSABLE_DATABASE_URL)`. La variable es explícita y distinta de `DATABASE_URL`. El archivo mockea `@/lib/db` (y `server-only`, como `profile.service.test.ts`) para que `getDb()` devuelva `neon(process.env.DISPOSABLE_DATABASE_URL)`; así ejercita el service real sin modificar `lib/db.ts`. No aplica migraciones: la tabla `user_profile_custom_fields` debe existir ya en la base desechable (la aplicación de 0004 allí la decide el propietario).

Guarda (se ejecuta antes de abrir ninguna conexión; si falla, el archivo falla, no se omite): rechazar si `DISPOSABLE_DATABASE_URL` es igual a `DATABASE_URL` o a `DATABASE_URL_UNPOOLED`, o si su host (normalizado sin sufijo `-pooler`) es igual al de cualquiera de ellas o está contenido en ellas. Cubre el host de DEV, que es el de `DATABASE_URL`; el host de PROD solo se cubre si está en esas variables (ver P-UX1-7).

Cada prueba crea usuarios propios en `app_users` (email único aleatorio) y los borra al terminar (cascade limpia los campos).

- I-01: aplicar 0004 sobre una base con 0001..0003 (solo si el propietario lo autoriza en la desechable); borrar un `app_users` borra sus campos (cascade); insertar con `user_id` inexistente falla (FK).
- I-02: SQL directo para saltarse el tope: insertar `position = 0` o `11` falla (check); dos filas con la misma `(user_id, position)` fallan; con 10 filas, un insert que repite posición o usa 11 falla. 
- I-03: `('Ubicación')` y `('ubicación')` del mismo usuario violan el índice único; el mismo texto en otro usuario se acepta; etiqueta con espacios al borde, espacios dobles, control o de 41 caracteres, y valor con `\n`, fallan (check).
- I-04: intercambio de posiciones (ambos sentidos y en extremos) y compactación tras borrar ejecutados por el service real, cada uno en una sola sentencia, sin violar `unique` (deferrable); posiciones finales 1..N.
- I-05: 12 altas en paralelo del mismo usuario con etiquetas distintas → exactamente 10 filas con posiciones 1..10 sin huecos ni duplicados y exactamente 2 resultados `limit`.
- I-06: swaps concurrentes y borrados concurrentes del mismo usuario → posiciones 1..N sin huecos ni duplicados.
- I-07: rollback ante error a mitad del lote: `sql.transaction` con una inserción válida seguida de una sentencia que falla (por ejemplo división por cero o un `check`) deja 0 filas nuevas; y una alta del service con la lista final forzada a fallar no deja la fila.

**Autorización y alcance:** estas pruebas y la migración NO se ejecutan sobre DEV ni PROD. El uso de la base desechable queda **pendiente de autorización expresa del propietario**; hasta entonces el reviewer solo verifica que el archivo se omite sin la variable y que la guarda existe (AC-25).

### Pruebas manuales (M-xx, por el propietario o el reviewer)

- M-01: añadir «Ubicación» desde «+ Añadir información» → aparece al final de Información personal.
- M-02: subir y bajar con 3 campos; recargar y comprobar el orden; botones deshabilitados en los extremos.
- M-03: editar etiqueta y valor; valor vacío muestra «Escribe un valor.» y no cambia nada; «Eliminar» elimina el campo.
- M-04: con dos cuentas, comprobar que cada una solo ve los suyos; un admin no ve los de otra persona.
- M-05: teléfono, cargo, empresa, cumpleaños, sitio web y nota siguen funcionando; la contraseña y los correos siguen abriendo Clerk.
- M-06: etiqueta reservada, duplicada, de 41 y valor de 201 o con salto de línea muestran el error en español junto al campo; un valor con `<script>` se ve como texto.
- M-07: teclado y lector: el menú, el diálogo, Subir/Bajar (con `aria-label`, foco conservado y anuncio de estado) y el foco de vuelta al abrir.
- Las pruebas manuales que requieren base (M-01..M-07) se hacen solo en un entorno autorizado por el propietario; no se ejecutan contra PROD.

## Archivos sensibles

- `db/migrations/0004_user_profile_custom_fields.sql`

(`lib/db.ts`, `scripts/db-migrate.mjs` y archivos de gobierno no se tocan.)

## Plan de tareas

### Fase 1
- [x] T1 — Migración 0004 (solo el archivo; no se ejecuta) · archivos: `db/migrations/0004_user_profile_custom_fields.sql` · depende de: — · paralelo con T2 (archivos disjuntos)
- [x] T2 — Tipos, schemas y sus tests · archivos: `modules/account/types/profile.types.ts`, `modules/account/schemas/profile.schema.ts`, `modules/account/schemas/profile.schema.test.ts` · depende de: — · paralelo con T1; base de T3 y T4
- [x] T3 — Service, acciones, lectura de servidor y sus tests unitarios · archivos: `modules/account/services/profile.service.ts`, `modules/account/services/profile.service.test.ts`, `modules/account/actions/profile.actions.ts`, `modules/account/actions/profile.actions.test.ts`, `modules/account/server.ts` · depende de: T1 (contrato SQL), T2 · secuencial
- [x] T4 — UI y su test de componente · archivos: `modules/account/components/CustomFieldForm.tsx`, `modules/account/components/CustomFieldForm.test.tsx`, `modules/account/components/ProfileFieldDialog.tsx`, `modules/account/components/ProfileView.tsx`, `app/dashboard/profile/page.tsx` · depende de: T3 · paralelo con T5 (archivos disjuntos)
- [x] T5 — Pruebas de integridad contra base desechable (omitidas por defecto; no se ejecutan sin autorización) · archivos: `modules/account/services/profile.service.integrity.test.ts` · depende de: T1, T3 · paralelo con T4

Total: 5 tareas y 15 archivos (1 sensible). Paralelismo: T1 y T2 entre sí; T4 y T5 entre sí (tras T3). T3 es secuencial porque importa lo de T2 y fija el contrato SQL de T1. Sin archivos compartidos fuera del módulo (`components/ui`, `lib/`, `package.json`, `app/layout.tsx`, `index.ts` no cambian). Sin Fase 2: no se elige la alternativa de `Pool`; solo se planificaría si la base desechable refuta S1..S4.

## Preguntas abiertas

- P-UX1-7: ¿cómo identifica la guarda de las pruebas de integridad el host de PROD, si su URL no está en `DATABASE_URL` ni `DATABASE_URL_UNPOOLED` del entorno donde se ejecutan? Propuesta (requiere decisión): una variable opcional con hosts prohibidos, o exigir que el nombre de la base desechable contenga una marca acordada. Mientras no se decida, la guarda cubre solo los hosts presentes en esas dos variables.
