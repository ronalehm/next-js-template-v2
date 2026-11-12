> Esta plantilla no sustituye Reviewer, CI, aprobaciones ni UAT.

## 1. Resumen de cambios

**Antes del merge**

- Objetivo:
- Rama de origen:
- Spec o ticket relacionado (si existe):
- Cambios:
  - Agregado:
  - Modificado:
  - Corregido:
  - Eliminado:
- Impacto funcional para Producto:

## 2. Validación técnica

**Antes del merge**

- [ ] Reviewer: APROBADO
- [ ] CI en verde y pruebas ejecutadas
- [ ] Autorizaciones aplicables obtenidas (si el PR toca gobierno o rutas protegidas)
- Evidencia o enlaces:

## 3. UAT

Reglas en `docs/SETUP.md`, sección «UAT y cambios solicitados» («Obligatoriedad y "UAT no aplicable"»).

**Antes del merge**

- [ ] UAT obligatorio
- [ ] UAT no aplicable (justificación registrada:)
- Funcionalidades o flujos que debe probar Producto:
- Resultado y evidencia:
- Observaciones pendientes:

> No declarar PASS antes de realizar la prueba.

## 4. Comunicación a Producto

**Antes del merge**

- Cambios y ajustes que Producto debe conocer:
- Responsable o referencia:
- [ ] Comunicación realizada
- [ ] Aceptación funcional registrada (cuando corresponda)

## 5. Actualización manual de MAIN

**Después del merge** (no marcar antes de fusionar)

- [ ] PR fusionado
- [ ] `main` local actualizado y SHA verificados

Detenerse si `main` tiene cambios locales, operaciones Git en curso o divergencia. Los SHA finales de `HEAD` y `origin/main` deben coincidir.

PowerShell:

```powershell
cd C:\Users\ronal\template-v2-pro
git status -sb
git fetch origin
git pull --ff-only origin main
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Git Bash:

```bash
cd /c/Users/ronal/template-v2-pro
git status -sb
git fetch origin
git pull --ff-only origin main
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```
