# Guía operativa de instalación funcional — Template V2 PRO

**Estado:** propuesta documental de cierre (24/11/2026). **Complementa y no sustituye** el procedimiento independiente B1 v1.2 ni el agente de replicación aislada ya probado por el propietario. La evidencia original de esos procedimientos debe enlazarse o adjuntarse por el equipo; no se reconstruye aquí como si fuese evidencia validada.

## 1. Alcance

Esta guía se aplica a una **copia de trabajo ya independizada** de la plantilla, destinada a un proyecto nuevo. Cada proyecto conserva Git, Clerk, Neon, Vercel, firmas SSH y responsables propios. El Template base no comparte credenciales o recursos.

**Antes de continuar:** comprobar el directorio y la rama del proyecto, que su repo Git es propio y que `git remote -v` no apunta por error a `ronalehm/next-js-template-v2` como remoto destinado a recibir pushes del derivado.

## 2. Requisitos

- Node.js `26.x`, npm y dependencias instaladas mediante `npm ci --ignore-scripts` (si no se han añadido dependencias con scripts obligatorios).
- Instancia **Clerk Development** exclusiva del entorno de prueba.
- Proyecto o rama **Neon** exclusiva; identificar proyecto, rama, base y host de la app y de migraciones **sin exponer secretos**.
- Aprobaciones humanas aplicables según `docs/SETUP.md` antes de cualquier operación protegida.

## 3. Configurar `.env.local` sin versionar secretos

En PowerShell, desde la raíz del derivado:

```powershell
Copy-Item .env.example .env.local
```

En Git Bash:

```bash
cp .env.example .env.local
```

Editar localmente `.env.local` con las claves obtenidas de los paneles del proyecto **receptor**, no de la plantilla ni de otros proyectos:

| Variable | Uso requerido |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Instancia Clerk Development del derivado |
| `CLERK_SECRET_KEY` | Misma instancia Clerk, lado servidor |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Secreto del webhook de esa instancia, si se habilita el flujo |
| `DATABASE_URL` | URL **pooled** de Neon para la aplicación |
| `DATABASE_URL_UNPOOLED` | URL **directa** de Neon para migraciones y alta inicial |

Las variables de URLs de sign-in/up aparecen en `.env.example`. Consultar dicho archivo para los valores de ruta de la aplicación.

**Verificación sin mostrar credenciales:** comprobar que `.env.local` queda ignorado y no rastreado por Git. Git Bash:

```bash
git check-ignore -v .env.local
git ls-files --error-unmatch .env.local
```

La segunda orden debe devolver que el archivo no está rastreado. Si estuviera rastreado, **detener el procedimiento** antes de crear PR/commit.

## 4. Confirmar destinos efectivos antes de ejecutar

**Advertencia del código actual:** `scripts/db-migrate.mjs` y `scripts/db-grant-superadmin.mjs` usan `DATABASE_URL_UNPOOLED || DATABASE_URL`. Si falta la primera, **recurren a la segunda**. El código no verifica automáticamente un identificador de proyecto Neon. La aplicación usa `DATABASE_URL`.

Comprobar en la misma sesión que se usará para ejecutar:

1. Que las claves **Clerk pública y privada** pertenecen a la misma instancia de desarrollo exclusiva del derivado.
2. Que el destino efectivo de `DATABASE_URL` (app) coincide con el Neon de prueba, usando el host pooled correcto.
3. Que `DATABASE_URL_UNPOOLED` **está presente** y su destino efectivo coincide con el **mismo proyecto/rama/base** usando el host directo.
4. Que los scripts de migración y superadmin apuntarán al destino de prueba, tomando en cuenta variables heredadas de PowerShell/Git Bash que puedan prevalecer sobre `.env.local`.
5. Que los destinos difieren de los recursos de la plantilla y de cualquier entorno de producción.

**No imprimir URL completas, contraseñas, tokens ni claves.** Si cualquier identificación es inconclusa, no correr la operación afectada.

## 5. Migraciones y superadministrador (solo con autorización válida)

Tras completar la verificación de aislamiento y contar con la autorización humana aplicable, ejecutar **en el derivado**:

```bash
npm run db:migrate
```

Este script aplica en orden `db/migrations/*.sql` y anota cada archivo en `schema_migrations`. Registrar **nombres de migración y resultado**, no credenciales. En el commit revisado hay cinco archivos, de `0001_app_users.sql` a `0005_app_users_clerk_deleted_user_id.sql`.

Tras comprobar nuevamente el destino y con autorización de alta administrativa:

```bash
npm run db:grant-superadmin -- admin-de-prueba@ejemplo.com
```

Usar un correo de prueba **realmente controlado en la instancia Clerk de ese derivado**, no el correo del ejemplo. El script crea/actualiza la fila como `superadmin` e `invited` cuando es nueva. Una identidad revocada no se reactiva con este script; la fila debe validarse y operar conforme a `lib/auth.ts`.

## 6. Prueba funcional mínima

```bash
npm run dev
```

Registrar en una evidencia fechada:

- URL `localhost`, commit exacto, proyecto derivado e identidad propia (sin secretos).
- Conexión de la app al Neon aislado y migraciones aplicadas allí.
- Inicio de sesión con un usuario de prueba en Clerk aislado.
- Acceso a funciones administrativas permitido al `superadmin`.
- Denegación de funciones administrativas a un usuario autenticado con rol normal.
- Ausencia de cambios en recursos del Template origen o PROD.

No repetir pruebas previamente cerradas por defecto: referenciar el reporte B2 existente y revalidar solo si hay cambios materiales de código, configuración o entorno.

## 7. SDD, aprobación y trazabilidad

La autoridad es `docs/SETUP.md`. Para trabajo SDD se requiere **comando humano de aprobación + firma SSH externa válida + gate conforme**. Las firmas antiguas del origen no autorizan un proyecto receptor y nunca se copian las claves privadas ni registros de origen como si fueran permisos actuales.

## 8. Despliegue y liberación

El despliegue es un hito separado del arranque en local. El propietario ha informado que ya validó un derivado desplegado. Registrar la referencia a su evidencia: repositorio/PR/CI, entorno Vercel, URL verificada, recursos separados, migraciones por entorno y reversión.

La evidencia SEC-1 existente exige **HSTS verificado en HTTPS real** y **CSP efectiva o aceptación expresa del riesgo de CSP** antes de declarar `RELEASE-1`. Un despliegue exitoso no prueba por sí solo estos dos controles. No desplegar sobre PROD como parte de una verificación documental.
