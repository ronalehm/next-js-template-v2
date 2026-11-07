// Spec approval hooks (see docs/SETUP.md §3).
//   record (UserPromptSubmit): "apruebo docs/specs/<slug>.md" is the functional approval: sets `Estado: aprobado`
//     and appends { spec, hash, phase, approver, date, sig } to docs/specs/approvals.jsonl.
//     "autorizo gobierno docs/specs/<slug>.md" is the privileged authorization: it unlocks the paths listed in
//     `## Cambios de gobierno` for this session, phase and spec content, and needs a valid functional approval first.
//     Signatures use an HMAC with a per-machine key kept outside the repo (~/.claude/spec-approval.key), a separate
//     domain per approval type and the repo root, so hand-written lines, replays and copies to other checkouts fail.
//     Ceiling: any process running as this OS user can read the key; settings.json denies Claude's file tools on it,
//     but a deliberate Bash command still could.
//     Ceiling: UserPromptSubmit also fires for headless, cross-session and scheduled prompts and nothing identifies the
//     source, so the HMAC does not prove human consent. isValid also requires an SSH signature only the key holder can make.
//     Ceiling: a same-user process can still replace the signers file or this hook; only admin-owned or server-side
//     verification closes that.
//   gate (PreToolUse Agent): launching an implementing agent requires every cited spec to be approved, unchanged
//     since its last approval and the prompt to declare its current phase. `developer` must cite a spec or declare
//     `Modo: build`.
//   guard (PreToolUse Write|Edit|NotebookEdit): governance files need a privileged authorization, sensitive files
//     need an approved spec listing them in `## Archivos sensibles`, specs are only written as `Estado: borrador`.
//   relay (PreToolUse on tools that deliver prompts): blocks sending an approval command as if the user typed it.
// Exit 2 = block, stderr is the reason. Fails closed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { fileURLToPath } from "node:url";

process.on("uncaughtException", (err) => block(`error en el hook de aprobación (${err.message}).`));

function block(reason) {
  console.error(`BLOQUEADO: ${reason}`);
  process.exit(2);
}

const SPECS = "docs/specs";
const input = JSON.parse(readFileSync(0, "utf8"));

function gitRoot(cwd) {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// In a desktop worktree session CLAUDE_PROJECT_DIR points to the main checkout; the session's own repo wins.
const root = resolve((input.cwd && gitRoot(input.cwd)) || process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const ledgerPath = resolve(root, SPECS, "approvals.jsonl");
const privilegedPath = process.env.SPEC_PRIVILEGED_FILE || join(homedir(), ".claude", "spec-privileged.jsonl");

const signersPath = process.env.SPEC_ALLOWED_SIGNERS || join(homedir(), ".claude", "spec-allowed-signers");

const PRIVILEGED_TTL_MS = 2 * 60 * 60 * 1000;
const IMPLEMENTS_NOTHING = new Set(["spec", "reviewer", "Explore", "Plan"]);

// No agent edits these, not even with a privileged authorization.
const NEVER = /(^|\/)(docs\/specs\/approvals\.jsonl|spec-approval\.key|spec-privileged\.jsonl|spec-allowed-signers|\.ssh\/.*|\.git(\/.*)?)$/i;
const GOVERNANCE =
  /(^|\/)(\.claude\/(?!plans\/|projects\/|worktrees\/)|CLAUDE(\.local)?\.md$|AGENTS\.md$|\.mcp\.json$|docs\/SETUP\.md$)/i;
const SENSITIVE =
  /(^|\/)(\.env(?!\.example$)[^/]*$|\.github\/workflows\/|db\/|migrations\/|prisma\/|drizzle\/|(proxy|middleware)\.[cm]?[jt]sx?$|scripts\/db-[^/]*$)|^(src\/)?(app|modules|components|hooks|lib)\/(.*\/)?[^/]*auth(?!or(?!i[sz]))|^(src\/)?lib\/(roles|db)/i;
const SPEC_FILE = /(^|\/)docs\/specs\/[^/]+\.md$/i;
const APPROVE = /^apruebo\s+(?:\.[\\/])?docs[\\/]specs[\\/]([\w-]+)\.md$/i;
const AUTHORIZE = /^autorizo\s+gobierno\s+(?:\.[\\/])?docs[\\/]specs[\\/]([\w-]+)\.md$/i;

const slashes = (path) => path.replace(/\\/g, "/");
// Windows: "a.md::$DATA", "a.md." and "a.md " name "a.md"; "C:a.md" is relative; "\\\\?\\C:\\a.md" and "/c/a.md" are absolute.
const withoutAliases = (path) =>
  slashes(path)
    .replace(/^\/\/[?.]\//, "")
    .replace(/^[a-z]:(?!\/)/i, "")
    .replace(/^\/([a-z])\//i, (match, drive) => (process.platform === "win32" ? `${drive}:/` : match))
    .split("/")
    .map((part, i) =>
      part === "." || part === ".." || (i === 0 && /^[a-z]:$/i.test(part)) ? part : part.replace(/:.*$/, "").replace(/[. ]+$/, ""),
    )
    .join("/");
const canonical = (path) => resolve(input.cwd ?? root, withoutAliases(path));
const read = (spec) => readFileSync(resolve(root, spec), "utf8").replace(/\r\n/g, "\n");
const STATE_LINE = /^(\s*-?\s*Estado:[ \t]*).*$/im;
const STATE_VALUE = /^\s*-?\s*Estado:[ \t]*(aprobado|borrador)[ \t]*$/im;
const isApproved = (text) => /^\s*-?\s*Estado:\s*aprobado\b/im.test(text);
const phase = (text) => text.match(/^\s*-?\s*Fase actual:\s*(\S+)/im)?.[1] ?? "";
// The state value and checkbox ticks change during the flow; any other change invalidates the approval.
const hash = (text) =>
  createHash("sha256").update(text.replace(STATE_VALUE, "").replace(/- \[x\]/gi, "- [ ]")).digest("hex");

// Lines under the first heading that matches, ignoring code blocks.
function sectionLines(text, isHeading) {
  const lines = text.replace(/^```[\s\S]*?^```.*$/gm, "").split("\n");
  const start = lines.findIndex(isHeading);
  if (start < 0) return [];
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => line.startsWith("## "));
  return end < 0 ? body : body.slice(0, end);
}

// Paths listed as "- `path`" under a "## <title>" heading.
const section = (text, title) =>
  sectionLines(text, (line) => line.trim() === `## ${title}`).map((line) => line.match(/^- `([^`]+)`/)?.[1]).filter(Boolean);

const keyPath = process.env.SPEC_APPROVAL_KEY_FILE || join(homedir(), ".claude", "spec-approval.key");

function key({ create = false } = {}) {
  if (!existsSync(keyPath)) {
    if (!create) return null;
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(keyPath, "utf8").trim();
}

const functionalFields = ({ spec, hash, phase, approver, date }) => ["functional", root, spec, hash, phase, approver, date];
const privilegedFields = ({ spec, hash, phase, paths, operation, session, expires, approver, date }) => [
  "privileged", root, spec, hash, phase, String(paths), operation, session, expires, approver, date,
];

const sign = (k, fields) => createHmac("sha256", k).update(fields.join("\n")).digest("hex");

function signed(k, fields, sig) {
  if (!k || typeof sig !== "string") return false;
  const expected = Buffer.from(sign(k, fields));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []);
const entries = (spec) => lines(ledgerPath).filter((entry) => entry.spec === spec);

// Unsigned or forged lines are ignored.
const lastApproval = (spec) => {
  const k = key();
  return entries(spec).filter((entry) => signed(k, functionalFields(entry), entry.sig)).at(-1);
};

// What the user signs in their own terminal. The state value and ticks are outside the hash, so it can be signed before or after "apruebo".
const statement = (spec, text) => `spec-approval\n${root}\n${spec}\n${hash(text)}\n${phase(text)}\n`;
const signCommand = (spec) =>
  `echo {} | node .claude/hooks/spec-approval.mjs statement ${spec} | ssh-keygen -Y sign -f ~/.ssh/spec_approval -n spec-approval > ${spec}.sig`;

function humanSigned(spec, text) {
  const sig = resolve(root, `${spec}.sig`);
  if (!existsSync(signersPath) || !existsSync(sig)) return false;
  try {
    execFileSync("ssh-keygen", ["-Y", "verify", "-f", signersPath, "-I", "approver", "-n", "spec-approval", "-s", sig], {
      input: statement(spec, text),
      stdio: ["pipe", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

const isValid = (spec, text) => isApproved(text) && lastApproval(spec)?.hash === hash(text) && humanSigned(spec, text);

// A spec with every task of its plan ticked stops unlocking protected files.
const planOpen = (text) => sectionLines(text, (line) => line.startsWith("## Plan")).some((line) => /- \[ \]/.test(line));

function digest(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");
}

// Approving with a different copy of the rules than the one in this repo would hide what is really enforced.
function checkIntegrity() {
  const copy = resolve(root, ".claude/hooks/spec-approval.mjs");
  if (existsSync(copy) && digest(copy) !== digest(fileURLToPath(import.meta.url))) {
    block(`se está ejecutando otra copia del hook, distinta de ${copy}. Integra o alinea el hook antes de continuar.`);
  }
}

function approver() {
  const git = (key) => {
    try {
      return execSync(`git config ${key}`, { cwd: root, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  const name = git("user.name");
  return name ? `${name} <${git("user.email")}>` : userInfo().username;
}

function approve(slug) {
  checkIntegrity();
  const spec = `${SPECS}/${slug}.md`;
  if (!existsSync(resolve(root, spec))) block(`la spec ${spec} no existe.`);
  const text = read(spec);
  if (isValid(spec, text)) block(`la spec ${spec} ya está aprobada y sin cambios.`);
  if (!STATE_LINE.test(text)) block(`la spec ${spec} no tiene línea "Estado:".`);
  const approved = text.replace(STATE_LINE, "$1aprobado");
  const entry = { spec, hash: hash(approved), phase: phase(approved), approver: approver(), date: new Date().toISOString() };
  entry.sig = sign(key({ create: true }), functionalFields(entry));
  writeFileSync(resolve(root, spec), approved);
  appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`);
  if (!humanSigned(spec, approved)) {
    console.log(`Spec ${spec} registrada, pero falta firma externa: no implementes ni lances agentes. El usuario debe ejecutar en Git Bash, no en PowerShell, desde la raíz del repo: ${signCommand(spec)}`);
    return;
  }
  // UserPromptSubmit stdout is added to Claude's context: it confirms the approval and starts implementation.
  console.log(
    `Spec ${spec} aprobada por ${entry.approver} (${entry.date}); el hook cambió su cabecera a "Estado: aprobado". ` +
      `Continúa ahora con la implementación siguiendo el flujo del orquestador (.claude/agents/orchestrator.md, sección 3 desde el paso 4): ` +
      `lanza el agente developer con la ruta ${spec} solo para la "Fase actual" de la spec` +
      (entry.phase ? ` (indica "Fase: ${entry.phase}" en el prompt)` : "") +
      ` y después el reviewer. No vuelvas a pedir aprobación para esa fase; las demás requieren una nueva. ` +
      `Esta aprobación no autoriza archivos de gobierno.`,
  );
}

function authorize(slug) {
  checkIntegrity();
  const spec = `${SPECS}/${slug}.md`;
  if (!existsSync(resolve(root, spec))) block(`la spec ${spec} no existe.`);
  const text = read(spec);
  if (!isValid(spec, text)) block(`la spec ${spec} necesita antes una aprobación funcional válida ("apruebo ${spec}").`);
  if (!planOpen(text)) block(`la spec ${spec} tiene su plan terminado: ya no autoriza cambios.`);
  const paths = section(text, "Cambios de gobierno");
  if (paths.length === 0) block(`la spec ${spec} no lista rutas en "## Cambios de gobierno".`);
  for (const path of paths) {
    if (NEVER.test(path) || !GOVERNANCE.test(path)) block(`"${path}" no se puede autorizar: no es un archivo de gobierno editable.`);
  }
  if (!input.session_id) block("la autorización de gobierno requiere una sesión identificada.");
  const entry = {
    spec,
    hash: hash(text),
    phase: phase(text),
    paths,
    operation: "edit",
    session: input.session_id,
    expires: Date.now() + PRIVILEGED_TTL_MS,
    approver: approver(),
    date: new Date().toISOString(),
  };
  entry.sig = sign(key({ create: true }), privilegedFields(entry));
  mkdirSync(dirname(privilegedPath), { recursive: true });
  appendFileSync(privilegedPath, `${JSON.stringify(entry)}\n`);
  console.log(
    `Autorización de gobierno de ${entry.approver} para ${spec}, fase "${entry.phase}", operación edit, solo esta sesión, ` +
      `válida 2 horas. Rutas: ${paths.join(", ")}. Si cambia la spec, deja de valer.`,
  );
}

function record() {
  const prompt = (input.prompt ?? "").trim();
  const granted = prompt.match(AUTHORIZE);
  if (granted) return authorize(granted[1]);
  const approved = prompt.match(APPROVE);
  if (approved) return approve(approved[1]);

  if (/^autorizo\s+gobierno\b/i.test(prompt)) {
    block(`para autorizar cambios de gobierno escribe exactamente "autorizo gobierno docs/specs/<slug>.md".`);
  }
  // A single token or a .md path, even with spaces, looks like an approval attempt: reject it so the user isn't misled.
  if (!/^apruebo(\s+\S+|\s.*\.md)?$/i.test(prompt)) return;
  const dir = resolve(root, SPECS);
  const pending = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${SPECS}/${f}`)
    .filter((s) => !isValid(s, read(s)));
  block(
    `para aprobar escribe exactamente "apruebo docs/specs/<slug>.md".` +
      (pending.length ? ` Pendientes: ${pending.join(", ")}.` : " No hay specs pendientes."),
  );
}

function gate() {
  const { subagent_type, prompt = "" } = input.tool_input ?? {};
  if (IMPLEMENTS_NOTHING.has(subagent_type)) return;

  const specs = [...new Set((prompt.match(/docs[\\/]specs[\\/][\w.-]+\.md/g) ?? []).map((s) => s.replace(/\\/g, "/")))];
  if (specs.length === 0) {
    if (subagent_type !== "developer" || /Modo:\s*build\b/i.test(prompt)) return;
    block("el prompt de developer debe indicar la ruta de la spec (docs/specs/<module>-<feature>.md) o declarar `Modo: build`.");
  }
  checkIntegrity();

  for (const spec of specs) {
    if (!existsSync(resolve(root, spec))) block(`la spec ${spec} no existe.`);
    const text = read(spec);
    if (isValid(spec, text)) {
      const current = phase(text);
      const declared = [...prompt.matchAll(/\bFase:\s*(\S+)/gi)].map((m) => m[1].replace(/^[`*"']+|[`*"'.,;:]+$/g, ""));
      if (current && !declared.includes(current)) {
        block(`la spec ${spec} solo autoriza la fase ${current}: el prompt debe declarar "Fase: ${current}".`);
      }
      continue;
    }
    const last = lastApproval(spec);
    if (last?.hash === hash(text) && isApproved(text)) {
      block(`la spec ${spec} no tiene firma externa válida. El usuario debe ejecutar en Git Bash, no en PowerShell, desde la raíz del repo: ${signCommand(spec)}`);
    }
    if (last && isApproved(text)) {
      block(`la spec ${spec} cambió después de su aprobación (${last.approver}, ${last.date}). El usuario debe volver a escribir "apruebo ${spec}".`);
    }
    if (!last && entries(spec).length > 0) {
      block(`la spec ${spec} no tiene una aprobación con firma válida en este checkout (registro alterado, aprobada en otro checkout o en otra máquina). El usuario debe volver a escribir "apruebo ${spec}".`);
    }
    block(`la spec ${spec} no está aprobada. El usuario debe escribir "apruebo docs/specs/<slug>.md" en el chat.`);
  }
}

function realPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(realPath(parent), basename(path));
  }
}

function hasPrivilege(rel) {
  const k = key();
  const specStillAuthorizes = ({ spec, date }) => {
    if (!existsSync(resolve(root, spec))) return false;
    const text = read(spec);
    // Any change to the spec, phase included, fails isValid until a new approval, and that approval is later than date.
    return isValid(spec, text) && new Date(date) >= new Date(lastApproval(spec).date) && planOpen(text);
  };
  return lines(privilegedPath).some(
    (entry) =>
      signed(k, privilegedFields(entry), entry.sig) &&
      Array.isArray(entry.paths) &&
      entry.paths.includes(rel) &&
      entry.operation === "edit" &&
      Boolean(input.session_id) &&
      entry.session === input.session_id &&
      Date.now() < entry.expires &&
      specStillAuthorizes(entry),
  );
}

function listedInApprovedSpec(rel) {
  const dir = resolve(root, SPECS);
  return (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${SPECS}/${f}`)
    .some((spec) => {
      const text = read(spec);
      return isValid(spec, text) && planOpen(text) && section(text, "Archivos sensibles").includes(rel);
    });
}

// Path inside its own repo, and whether that repo is this session's. Null outside any repo.
function repoPath(path) {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  const own = gitRoot(dir);
  const same = (a, b) => slashes(realPath(a)).toLowerCase() === slashes(realPath(b)).toLowerCase();
  if (own) return { rel: slashes(relative(realPath(own), realPath(path))), ours: same(own, root) };
  const rel = slashes(relative(root, path));
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel) ? { rel, ours: true } : null;
}

// ponytail: Write/Edit/NotebookEdit only. Bash can still reach these files; the reviewer catches it on the real diff.
function protect(abs) {
  const real = realPath(abs);
  const rel = slashes(relative(root, abs));
  const forms = [slashes(abs), slashes(real)];

  if (forms.some((path) => NEVER.test(path))) {
    block(`${rel} es un registro de gobierno: ningún agente lo edita.`);
  }
  if (forms.some((path) => GOVERNANCE.test(path))) {
    checkIntegrity();
    if (!hasPrivilege(rel)) {
      block(`${rel} es un archivo de gobierno: la aprobación de una spec no lo autoriza. Requiere que la spec lo liste en "## Cambios de gobierno" y que el usuario escriba "autorizo gobierno docs/specs/<slug>.md", o que lo edite él mismo.`);
    }
    return;
  }
  const sensitive = [abs, real].map(repoPath).find((found) => found && SENSITIVE.test(found.rel));
  if (sensitive) {
    checkIntegrity();
    if (!sensitive.ours || !listedInApprovedSpec(rel)) {
      block(`${rel} es una ruta sensible: requiere una spec aprobada que la liste en "## Archivos sensibles". "Modo: build" no la autoriza.`);
    }
  }
}

// Claude may only write specs as `Estado: borrador`. Only the record hook (user's "apruebo") sets `aprobado`.
// ponytail: Bash redirects (echo > spec.md) bypass this; the gate still rejects unsigned approvals.
function guard() {
  const { file_path = "", notebook_path = "", content, new_string, old_string = "", replace_all, edits } = input.tool_input ?? {};
  // Settings hooks run without workspace trust; agent frontmatter hooks do not.
  if (input.agent_type === "orchestrator") orchestrator();
  if (input.agent_type === "developer") developer();
  const target = file_path || notebook_path;
  if (!target) return;
  const abs = canonical(target);
  protect(abs);
  if (!SPEC_FILE.test(slashes(abs))) return;

  const states = (text = "") => [...text.matchAll(/^\s*-?\s*Estado:[ \t]*(.*)$/gim)].map((m) => m[1].trim());
  const onlyDraft = (text) => states(text).every((s) => /^borrador\b/i.test(s));
  const reason = `las specs solo se escriben con "Estado: borrador"; la aprobación la hace el usuario escribiendo "apruebo docs/specs/<slug>.md" (${file_path}).`;

  if (content !== undefined) {
    if (states(content).length === 0 || !onlyDraft(content)) block(reason);
    return;
  }
  const changes = edits ?? [{ old_string, new_string, replace_all }];
  for (const e of changes) {
    if (!onlyDraft(e.new_string)) block(reason);
    if (states(e.old_string ?? "").length > 0 && states(e.new_string).length === 0) block(reason);
  }
  // The edit may only name part of the state line, so judge the resulting file.
  if (existsSync(abs)) {
    const before = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
    const after = changes.reduce(
      (text, e) => (e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string)),
      before,
    );
    const changed = String(states(before)) !== String(states(after));
    if (changed && (states(after).length === 0 || !onlyDraft(after))) block(reason);
    const ticks = (text) => (text.match(/- \[x\]/gi) ?? []).length;
    if (isApproved(after) && ticks(after) < ticks(before)) {
      block(`no se desmarcan casillas de una spec aprobada: reabriría su plan sin cambiar el hash (${file_path}).`);
    }
  }
}

// developer (PreToolUse inside the developer agent): specs are read-only for developer.
// Read/Glob/Grep are allowed; writing tools and any Bash command that names docs/specs are blocked.
function developer() {
  const { file_path = "", notebook_path = "", command = "" } = input.tool_input ?? {};
  const SPEC_PATH = /(^|[\\/\s"'])docs[\\/]specs([\\/]|\b)/i;
  const tool = input.tool_name ?? "";
  if (tool === "Bash" || tool === "PowerShell" ? SPEC_PATH.test(command) : SPEC_PATH.test(file_path || notebook_path)) {
    block("el agente developer nunca modifica docs/specs/ (solo puede leer las specs con Read).");
  }
}

// orchestrator (PreToolUse Edit inside the orchestrator): its only edits are the plan checkboxes of a spec.
function orchestrator() {
  const { file_path = "" } = input.tool_input ?? {};
  if (!SPEC_FILE.test(slashes(canonical(file_path)))) {
    block("el orquestador solo edita las casillas del plan en docs/specs/.");
  }
}

const strings = (value) =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

// ponytail: stops the literal command only; encoded or concatenated text passes. Declared as residual risk.
function relay() {
  if (input.agent_type === "developer") developer();
  const values = strings(input.tool_input);
  const command = (text) => APPROVE.test(text.trim()) || AUTHORIZE.test(text.trim());
  const launchesClaude = (text) =>
    /(?<!\.)claude(?!(\.local)?\.md)/i.test(text) && /(apruebo|autorizo\s+gobierno)\s+\S*docs[\\/]specs/i.test(text);
  const shell = /^(Bash|PowerShell|mcp__terminal__)/.test(input.tool_name ?? "");
  if (values.some(command) || (shell && values.some(launchesClaude))) {
    block(`${input.tool_name} no puede enviar una aprobación: solo el usuario la escribe en el chat.`);
  }
}

// Prints what the user signs. Reads nothing secret.
function printStatement() {
  const spec = slashes(process.argv[3] ?? "");
  if (!/^docs\/specs\/[\w-]+\.md$/.test(spec) || !existsSync(resolve(root, spec))) block(`la spec ${spec} no existe.`);
  process.stdout.write(statement(spec, read(spec)));
}

const mode = { record, gate, guard, developer, orchestrator, relay, statement: printStatement }[process.argv[2]];
if (!mode) block(`modo desconocido "${process.argv[2]}".`);
mode();
