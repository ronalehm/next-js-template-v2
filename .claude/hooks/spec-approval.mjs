// Spec approval hooks (see docs/SETUP.md §3).
//   record (UserPromptSubmit): "apruebo docs/specs/<slug>.md" is the functional approval: sets `Estado: aprobado`
//     and appends { spec, hash, phase, approver, date, sig } to docs/specs/approvals.jsonl.
//     "autorizo gobierno docs/specs/<slug>.md" is the privileged authorization: it unlocks the paths listed in
//     `## Cambios de gobierno` for this session, phase and spec content, and needs a valid functional approval first.
//     It only records a request: it unlocks nothing until the user signs its own statement (header spec-governance,
//     root, spec, hash, phase, session, paths, operation, expiry) into <spec>.gov.sig, so running record from a
//     script, a copy of this hook or another session never yields a usable authorization.
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
//   product Bash (relay): product's only shell is the C1 allowlist (productCommand: positive grammar, git by subcommand, curl gate).
//   secrets (PreToolUse Read|Glob|Grep, UserPromptSubmit): product stays inside the repo and away from secret paths; other agents exit 0.
// Exit 2 = block, stderr is the reason. Fails closed.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
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
// secrets runs on every Read/Glob/Grep and prompt of every agent: anyone but product leaves before any path or git work.
if (process.argv[2] === "secrets" && input.agent_type !== "product") process.exit(0);

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
  /(^|\/)(\.claude\/(?!plans\/|projects\/|worktrees\/)|CLAUDE(\.local)?\.md$|AGENTS\.md$|\.mcp\.json$|docs\/SETUP\.md$|docs\/uat\/)/i;
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
// Full value of the "Fase actual" line ("Fase 1", "B.1"); "" when missing or empty.
const phase = (text) => text.match(/^[ \t]*-?[ \t]*Fase actual:[ \t]*(.*)$/im)?.[1].trim() ?? "";
// Phase without the optional "Fase " prefix: "Fase 1" -> "1".
const phaseId = (text) => phase(text).replace(/^Fase\s+/i, "");
// First token of the phase: what statements signed before the full value existed used ("Fase 1" -> "Fase").
const legacyPhase = (text) => phase(text).match(/^\S*/)[0];
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
const statement = (spec, text, signedPhase = phase(text)) => `spec-approval\n${root}\n${spec}\n${hash(text)}\n${signedPhase}\n`;
// What the user signs to grant one privileged authorization. Its own header keeps a functional signature from matching;
// labelled lines let the user check session, paths and expiry before signing.
const govStatement = (e) =>
  `spec-governance\nraiz: ${root}\nspec: ${e.spec}\nhash: ${e.hash}\nfase: ${e.phase}\nsesion: ${e.session}\n` +
  `rutas: ${JSON.stringify(e.paths)}\noperacion: ${e.operation}\ncaduca: ${new Date(e.expires).toISOString()}\n`;
const SESSION_ID = /^[\w-]+$/;
// Signs a checked, non-empty statement file, never a pipe: a failing node would otherwise sign empty input.
// node.exe skips Git Bash's winpty alias for node. It shows what is signed, and replaces the .sig only after it verifies.
// A governance signature names its session, so a later request from another session cannot take its place.
const signCommand = (spec, session = null) => {
  const target = `${spec}${session ? ".gov" : ""}.sig`;
  return (
    `s=$(mktemp) && echo {} | node.exe .claude/hooks/spec-approval.mjs statement ${spec}${session ? ` gobierno ${session}` : ""} > "$s" && test -s "$s" && cat "$s"` +
    ` && ssh-keygen -Y sign -f ~/.ssh/spec_approval -n spec-approval "$s"` +
    ` && ssh-keygen -Y verify -f ~/.claude/spec-allowed-signers -I approver -n spec-approval -s "$s.sig" < "$s"` +
    ` && mv "$s.sig" ${target} && echo "Firma verificada: ${target}" || echo "ERROR: firma no creada; ${target} sin cambios" >&2;` +
    ` rm -f "$s" "$s.sig"`
  );
};

function sshVerified(sigFile, text) {
  const sig = resolve(root, sigFile);
  if (!existsSync(signersPath) || !existsSync(sig)) return false;
  try {
    execFileSync("ssh-keygen", ["-Y", "verify", "-f", signersPath, "-I", "approver", "-n", "spec-approval", "-s", sig], {
      input: text,
      stdio: ["pipe", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
// The legacy statement (first token of the phase) keeps old signatures valid for the exact content that was signed.
const humanSigned = (spec, text) =>
  sshVerified(`${spec}.sig`, statement(spec, text)) || sshVerified(`${spec}.sig`, statement(spec, text, legacyPhase(text)));

const isValid = (spec, text) => isApproved(text) && lastApproval(spec)?.hash === hash(text) && humanSigned(spec, text);

// A spec with every task of its plan ticked stops unlocking protected files.
// Only the "### Fase <id>" subsection of the current phase counts (exact id: "### Fase 1" is not "### Fase 10").
// Without any "### Fase" the whole "## Plan*" section counts; with some but none matching, nothing is open (missing).
function planScope(text) {
  const plan = sectionLines(text, (line) => line.startsWith("## Plan"));
  const isPhase = (line) => /^###[ \t]+Fase\b/.test(line);
  if (!plan.some(isPhase)) return { lines: plan, missing: false };
  const start = plan.findIndex((line) => line.trim() === `### Fase ${phaseId(text)}`);
  if (start < 0) return { lines: [], missing: true };
  const body = plan.slice(start + 1);
  const end = body.findIndex((line) => line.startsWith("### "));
  return { lines: end < 0 ? body : body.slice(0, end), missing: false };
}
const planOpen = (text) => planScope(text).lines.some((line) => /- \[ \]/.test(line));

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
      (entry.phase ? ` (indica "Fase: ${phaseId(approved)}" en el prompt)` : "") +
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
  if (planScope(text).missing) block(`la spec ${spec} no tiene subsección "### Fase ${phaseId(text)}" en su plan: no autoriza nada.`);
  if (!planOpen(text)) block(`la spec ${spec} tiene su plan terminado: ya no autoriza cambios.`);
  const paths = section(text, "Cambios de gobierno");
  if (paths.length === 0) block(`la spec ${spec} no lista rutas en "## Cambios de gobierno".`);
  for (const path of paths) {
    if (NEVER.test(path) || !GOVERNANCE.test(path)) block(`"${path}" no se puede autorizar: no es un archivo de gobierno editable.`);
  }
  if (!SESSION_ID.test(input.session_id ?? "")) block("la autorización de gobierno requiere una sesión identificada.");
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
    `Autorización de gobierno de ${entry.approver} registrada para ${spec}, fase "${entry.phase}", operación edit, solo esta sesión, ` +
      `válida 2 horas. Rutas: ${paths.join(", ")}. Si cambia la spec, deja de valer. ` +
      `Falta firma externa: no edites gobierno. El usuario debe ejecutar en Git Bash, no en PowerShell, desde la raíz del repo: ${signCommand(spec, entry.session)}`,
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
      // Exact id with a boundary: "1" is not "10" nor "1.1"; trailing punctuation, backticks, ** and quotes are tolerated.
      const id = phaseId(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const declared = new RegExp(`\\bFase:\\s*(?:Fase\\s+)?[\`*"']*${id}(?![\\w-]|\\.\\w)`, "i").test(prompt);
      if (current && !declared) {
        block(`la spec ${spec} solo autoriza la fase ${current}: el prompt debe declarar "Fase: ${phaseId(text)}".`);
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
      entry.expires - Date.parse(entry.date) <= PRIVILEGED_TTL_MS &&
      specStillAuthorizes(entry) &&
      sshVerified(`${entry.spec}.gov.sig`, govStatement(entry)),
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
  if (input.agent_type === "product") product();
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

// product (PreToolUse inside the product agent): read-only. Whatever tool reaches this hook is blocked,
// except Bash, which relay() sends through productCommand().
function product() {
  block(`el agente product es de solo lectura (${input.tool_name ?? "herramienta"}); el registro lo escribe un developer en Modo: build.`);
}

const MSG = {
  grammar: "el comando no encaja en la gramática positiva de product (RN-C07): un solo comando simple, sin encadenado, redirección, expansión ni comillas fuera de lugar. Prohibido para todos en el flujo UAT (C4).",
  forbidden: "comando fuera de la allowlist C1 de product (RN-C02, RN-C05): prohibido para todos en el flujo UAT (C3b/C4).",
  producer: "este paso lo ejecuta Producto (ASISTIDA) o el Developer dentro del EUA verificado; product solo propone el comando (C2/C3a).",
  secret: "la ruta es secreta (regla de secretos, RN-C08): prohibido para todos en el flujo UAT.",
  hardlink: "archivo con más de un enlace duro (nlink > 1): no se puede acreditar que no apunte a un secreto (RN-C08); prohibido para product.",
  toobig: "el directorio supera el límite de 5000 archivos admitidos para Grep (RN-C08): acota la ruta.",
  outside: "la ruta queda fuera del repositorio (confinamiento, RN-C08): prohibido para product.",
};

// Paths that never reach product: initial list of RN-C08, tested on repo-relative paths. .env.example/.sample/.template are fine.
const SECRET =
  /(^|\/)(\.env(?!\.(example|sample|template)$)[^/]*$|[^/]*\.(pem|key|p12|pfx)$|id_rsa[^/]*$|id_ed25519[^/]*$|\.ssh(\/|$)|\.npmrc$|\.netrc$|\.git-credentials$|\.docker\/config\.json$|\.mcp\.json$|\.claude\/settings\.local\.json$|\.vercel(\/|$)|credentials[^/]*\.json$|spec-approval\.key$|spec-privileged\.jsonl$|\.git(\/|$))/i;
const expandHome = (path) => (path === "~" || /^~[\\/]/.test(path) ? join(homedir(), path.slice(2)) : path);
const insideRel = (rel) => rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);

// "secret" | "outside" | null. Reuses withoutAliases/canonical/realPath, so Windows aliases and links resolve before checking.
function pathProblem(path) {
  const abs = canonical(expandHome(path));
  const real = realPath(abs);
  const rels = [relative(root, abs), relative(realPath(root), real)].map(slashes);
  if (!insideRel(rels[1])) return "outside";
  return rels.filter(insideRel).some((rel) => SECRET.test(rel)) ? "secret" : null;
}

// Bash grammar: one line, single spaces, unquoted tokens from a closed set or whole single-quoted tokens. Null if it does not fit.
const UNQUOTED = /^[A-Za-z0-9._/:=@,+%~^-]+$/;
function tokenize(text) {
  if (typeof text !== "string" || !/^[\x20-\x7e]+$/.test(text)) return null;
  const tokens = [];
  for (let i = 0; i < text.length; ) {
    let value;
    const quoted = text[i] === "'";
    if (quoted) {
      const end = text.indexOf("'", i + 1);
      value = end < 0 ? "" : text.slice(i + 1, end);
      if (end < 0 || !value || value.includes("\\")) return null;
      i = end + 1;
    } else {
      const end = text.indexOf(" ", i);
      value = text.slice(i, end < 0 ? undefined : end);
      if (!UNQUOTED.test(value)) return null;
      i += value.length;
    }
    tokens.push({ value, quoted });
    if (i < text.length && (text[i] !== " " || ++i >= text.length)) return null;
  }
  return tokens;
}

const PATH_TOKEN = /^[A-Za-z0-9._/-]+$/;
const REV = /^(?:HEAD|[0-9a-fA-F]{7,40}|[A-Za-z0-9_][A-Za-z0-9._/-]*)(?:[~^]\d{0,3})*$/;
const isN = (t) => !t.quoted && /^\d{1,4}$/.test(t.value);
const isLines = (t) => !t.quoted && /^\d{1,5},\d{1,5}$/.test(t.value);
// Validators return null when fine, otherwise "deny" (grammar) or "secret"/"outside".
const pathArg = (value) =>
  !PATH_TOKEN.test(value) || /^[-/]/.test(value) || value.split("/").includes("..") ? "deny" : pathProblem(value);
// A rev token can also name a file for git, so its base is checked against the secret list too.
const rev = (value) => {
  if (!REV.test(value) || value.includes("..")) return "deny";
  return SECRET.test(value.replace(/[~^]\d{0,3}.*$/, "")) ? "secret" : null;
};
const revArg = (t) => (t.quoted ? "deny" : rev(t.value));
const diffArg = (t) => {
  if (t.quoted) return "deny";
  if (!t.value.includes("..")) return rev(t.value);
  const parts = t.value.split("..");
  return t.value.includes("...") || parts.length !== 2 ? "deny" : rev(parts[0]) || rev(parts[1]);
};
const showArg = (t) => {
  if (t.quoted) return "deny";
  const [head, ...rest] = t.value.split(":");
  return rest.length === 0 ? rev(head) : rest.length > 1 ? "deny" : rev(head) || pathArg(rest[0]);
};
const NO_EXT = ["--no-ext-diff", "--no-textconv"];

// Positive git allowlist by subcommand (RN-C07): exact tokens only, nothing abbreviated or combined.
const GIT = {
  log: { flags: ["--oneline", "--stat", "--name-only", "--name-status", "-p", ...NO_EXT], valued: { "-n": isN }, arg: revArg, paths: true },
  show: { flags: ["--stat", "--name-only", ...NO_EXT], need: NO_EXT, arg: showArg },
  diff: { flags: ["--stat", "--name-only", "--name-status", ...NO_EXT], need: NO_EXT, arg: diffArg, paths: true },
  status: { flags: ["--short", "-s", "--porcelain"] },
  "ls-files": { paths: true },
  "rev-parse": { flags: ["--short", "--abbrev-ref", "--show-toplevel"], arg: (t) => (!t.quoted && t.value === "HEAD" ? null : "deny") },
  branch: { flags: ["--list", "--show-current"] },
  blame: { valued: { "-L": isLines }, arg: revArg, paths: true, onePath: true, needPaths: true },
  grep: { flags: ["-n", "-i", "-w", "-l", "-c"], valued: { "-e": () => true }, need: ["-e"], paths: true, needPaths: true },
};

function gitProblem(tokens) {
  // Object.hasOwn: tokens like "constructor" or "__proto__" must not resolve to inherited properties.
  const spec = tokens[0] && !tokens[0].quoted && Object.hasOwn(GIT, tokens[0].value) ? GIT[tokens[0].value] : undefined;
  if (!spec) return "deny";
  const seen = new Set();
  let args = 0;
  for (let i = 1; i < tokens.length; i++) {
    const { value, quoted } = tokens[i];
    if (!quoted && value === "--") {
      const paths = tokens.slice(i + 1);
      if (!spec.paths || paths.length === 0 || (spec.onePath && paths.length !== 1)) return "deny";
      const found = paths.map((t) => (t.quoted ? "deny" : pathArg(t.value)));
      seen.add("--");
      return found.find((p) => p === "deny") ?? found.find(Boolean) ?? finish();
    }
    if (!quoted && spec.flags?.includes(value)) seen.add(value);
    else if (!quoted && spec.valued && Object.hasOwn(spec.valued, value)) {
      const next = tokens[++i];
      if (!next || !spec.valued[value](next)) return "deny";
      seen.add(value);
    } else if (quoted || value.startsWith("-") || !spec.arg || args++ > 0) return "deny";
    else {
      const problem = spec.arg(tokens[i]);
      if (problem) return problem;
    }
  }
  return finish();

  function finish() {
    const needs = [...(spec.need ?? []), ...(seen.has("-p") ? NO_EXT : []), ...(spec.needPaths ? ["--"] : [])];
    return needs.every((flag) => seen.has(flag)) ? null : "deny";
  }
}

const LOOPBACK = /^(127\.0\.0\.1|localhost)$/;
// curl against the isolated UAT target only: closed options, one http:// URL listed in PRODUCT_UAT_HTTP_TARGETS, no inherited config or proxy.
function curlAllowed(tokens) {
  if (tokens[0]?.value !== "-q" || tokens[0].quoted) return false;
  const targets = (process.env.PRODUCT_UAT_HTTP_TARGETS ?? "").split(/[\s,;]+/).filter(Boolean);
  const noproxy = [];
  let url;
  for (let i = 1; i < tokens.length; i++) {
    const { value, quoted } = tokens[i];
    const next = () => tokens[++i];
    if (/^http:\/\//.test(value)) {
      if (url) return false;
      url = value;
    } else if (quoted) return false;
    else if (["-s", "-S", "-i", "-I"].includes(value)) continue;
    else if (value === "--noproxy") {
      const host = next();
      if (!host || host.quoted) return false;
      noproxy.push(host.value);
    } else if (value === "--max-time") {
      const seconds = next();
      if (!seconds || seconds.quoted || !/^\d{1,4}$/.test(seconds.value)) return false;
    } else if (value === "-H") {
      const header = next();
      if (!header || !header.quoted || !/^Accept: \S.*$/.test(header.value)) return false;
    } else return false;
  }
  const match = url?.match(/^http:\/\/([A-Za-z0-9.-]+):(\d{1,5})(\/[^\[\]{}\\]*)?$/);
  return Boolean(match) && LOOPBACK.test(match[1]) && noproxy.length === 1 && noproxy[0] === match[1] && targets.includes(`${match[1]}:${match[2]}`);
}

const PRODUCER = /^(vitest|playwright)$/;
const WRITES = /^(-X|--request|-d|--data.*|-F|--form|-T|--upload-file)$/;
// C2/C3a are run by Producto or a Developer; everything else outside C1 is forbidden for everyone.
function refusal(tokens) {
  const [program, ...args] = tokens.map((t) => t.value);
  const runsTests = PRODUCER.test(program) || (/^(npx|pnpm|yarn)$/.test(program) && args.some((a) => PRODUCER.test(a)));
  return runsTests || (program === "curl" && args.some((a) => WRITES.test(a))) ? MSG.producer : MSG.forbidden;
}

// product's Bash: denied unless the whole command fits the C1 allowlist (RN-C02, RN-C05..C07). Never prints the command.
function productCommand() {
  const tokens = tokenize(input.tool_input?.command);
  if (!tokens) block(MSG.grammar);
  const [program, ...args] = tokens;
  if (program.quoted) block(MSG.grammar);
  let problem = "deny";
  if (program.value === "git") problem = gitProblem(args) || gitLinkProblem(args);
  else if (/^(node|npm)$/.test(program.value) && args.length === 1 && args[0].value === "--version" && !args[0].quoted) problem = null;
  else if (program.value === "curl" && curlAllowed(args)) problem = null;
  if (problem) block(problem === "deny" ? refusal(tokens) : MSG[problem]);
}

// secrets (PreToolUse Read|Glob|Grep and UserPromptSubmit): product stays inside the repo and away from secret paths.
const SECRET_NAMES = [".env", ".env.local", ".env.production", "a.pem", "a.key", "a.p12", "a.pfx", "id_rsa", "id_rsa.pub", "id_ed25519", ".npmrc", ".netrc", ".git-credentials", "credentials.json", ".mcp.json", "settings.local.json", "spec-approval.key", "spec-privileged.jsonl"];
const GLOB_META = /[*?[\]{}]/;
const globRegex = (segment) =>
  new RegExp(`^${segment.replace(/[.+^$()|\\]/g, "\\$&").replace(/\*+/g, ".*").replace(/\?/g, ".").replace(/\{([^}]*)\}/g, (_, a) => `(${a.replace(/,/g, "|")})`)}$`, "i");

function globProblem(pattern, base) {
  const full = expandHome(slashes(pattern));
  const segments = full.split("/");
  const firstMeta = segments.findIndex((s) => GLOB_META.test(s));
  const fixed = (firstMeta < 0 ? segments : segments.slice(0, firstMeta)).join("/");
  if (firstMeta >= 0 && segments.slice(firstMeta).includes("..")) return "outside";
  const absolute = isAbsolute(full) || /^[a-z]:/i.test(full) || full.startsWith("//");
  const rootProblem = pathProblem(absolute ? fixed || "/" : join(base ?? ".", fixed));
  if (rootProblem || firstMeta < 0) return rootProblem;
  const last = segments.at(-1);
  const hidden = segments.slice(0, -1).some((s) => /^\.(ssh|git|vercel|docker)$/i.test(s));
  const matches = GLOB_META.test(last) ? SECRET_NAMES.some((name) => globRegex(last).test(name)) : SECRET.test(last);
  return hidden || matches ? "secret" : null;
}

// Hard links hide a secret behind an innocent name. Files only; .git/, node_modules/ and .next/ are skipped; over the limit fails closed.
const MAX_GREP_FILES = 5000;
const SKIP_DIRS = new Set([".git", "node_modules", ".next"]);
const hardLinked = (file) => {
  try {
    const st = statSync(file);
    return st.isFile() && st.nlink > 1; // directories have nlink >= 2 on Linux/WSL2
  } catch (e) {
    return e.code !== "ENOENT"; // missing path: nothing to expose; any other error fails closed
  }
};
function linkProblem(path) {
  const real = realPath(canonical(expandHome(path)));
  let seen = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && (problem = walk(full))) return problem;
      } else if (e.isFile()) {
        if (++seen > MAX_GREP_FILES) return "toobig";
        if (lstatSync(full).nlink > 1) return "hardlink";
      }
    }
    return null;
  };
  let problem = null;
  try {
    return lstatSync(real).isDirectory() ? walk(real) : hardLinked(real) ? "hardlink" : null;
  } catch (e) {
    return e.code === "ENOENT" ? null : "deny"; // missing path: nothing to expose
  }
}

// L10: git grep/diff/blame read the working tree, so a hard link with an innocent name could leak a secret.
// Scope = pathspecs after "--", else the whole repo (diff without pathspec). No type/glob filter. Runs only after gitProblem() passed.
function gitLinkProblem(tokens) {
  if (!["grep", "diff", "blame"].includes(tokens[0].value)) return null;
  const dd = tokens.findIndex((t) => !t.quoted && t.value === "--");
  const scope = dd < 0 ? [root] : tokens.slice(dd + 1).map((t) => t.value);
  for (const path of scope) {
    const problem = linkProblem(path);
    if (problem) return problem;
  }
  return null;
}

const GREP_TYPES =["ts", "js", "md", "css", "html"];
const GREP_GLOB = /^(\*\*\/)?\*\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|css|html)$/;

function readProblem(tool, ti) {
  if (tool === "Read") return typeof ti.file_path === "string" && ti.file_path ? pathProblem(ti.file_path) || (hardLinked(realPath(canonical(expandHome(ti.file_path)))) ? "hardlink" : null) : "deny";
  if (tool === "Glob") {
    if (typeof ti.pattern !== "string" || !ti.pattern || (ti.path !== undefined && typeof ti.path !== "string")) return "deny";
    return (ti.path && pathProblem(ti.path)) || globProblem(ti.pattern, ti.path);
  }
  if (tool === "Grep") {
    const { path, type, glob } = ti;
    if (typeof path !== "string" || !path || (type === undefined && glob === undefined)) return "deny";
    if (type !== undefined && !GREP_TYPES.includes(type)) return "deny";
    if (glob !== undefined && !(typeof glob === "string" && GREP_GLOB.test(glob))) return "deny";
    return pathProblem(path) || linkProblem(path);
  }
  return null;
}

// Mentions look like "@path" at a word start, or @"path with spaces". Directories only list names, so they are fine.
function mentions(prompt) {
  return [...String(prompt).matchAll(/(?:^|\s)@(?:"([^"]+)"|(\S+))/g)].map((m) =>
    (m[1] ?? m[2]).replace(/[,;:!?)\]"'>]+$/, "").replace(/#.*$/, ""),
  );
}

function secrets() {
  const event = input.hook_event_name;
  const problems =
    event === "PreToolUse"
      ? [readProblem(input.tool_name, input.tool_input ?? {})]
      : event === "UserPromptSubmit"
        ? mentions(input.prompt ?? "").map((path) => (path ? pathProblem(path) || (hardLinked(realPath(canonical(expandHome(path)))) ? "hardlink" : null) : null))
        : ["deny"];
  const problem = problems.find(Boolean);
  if (problem) block(problem === "deny" ? "consulta de product fuera de la lista cerrada (RN-C08): prohibido en el flujo UAT." : MSG[problem]);
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
  if (input.agent_type === "product" && input.tool_name === "Bash") productCommand();
  else if (input.agent_type === "product") product();
  const values = strings(input.tool_input);
  const command = (text) => APPROVE.test(text.trim()) || AUTHORIZE.test(text.trim());
  const launchesClaude = (text) =>
    /(?<!\.)claude(?!(\.local)?\.md)/i.test(text) && /(apruebo|autorizo\s+gobierno)\s+\S*docs[\\/]specs/i.test(text);
  // Running the hook's record mode from a shell would write a ledger entry nobody typed, including "autorizo gobierno".
  const recordsByHand = (text) => /spec-approval/i.test(text) && /\brecord\b/i.test(text);
  const shell = /^(Bash|PowerShell|mcp__terminal__)/.test(input.tool_name ?? "");
  if (values.some(command) || (shell && values.some((text) => launchesClaude(text) || recordsByHand(text)))) {
    block(`${input.tool_name} no puede enviar una aprobación: solo el usuario la escribe en el chat.`);
  }
}

// Prints what the user signs. With "gobierno <session>", that session's latest privileged request for the spec here.
function printStatement() {
  const spec = slashes(process.argv[3] ?? "");
  if (!/^docs\/specs\/[\w-]+\.md$/.test(spec) || !existsSync(resolve(root, spec))) block(`la spec ${spec} no existe.`);
  if (process.argv[4] !== "gobierno") return process.stdout.write(statement(spec, read(spec)));
  const session = process.argv[5] ?? "";
  if (!SESSION_ID.test(session)) block(`indica la sesión: statement ${spec} gobierno <session_id>.`);
  const k = key();
  const entry = lines(privilegedPath)
    .filter((e) => e.spec === spec && e.session === session && signed(k, privilegedFields(e), e.sig))
    .at(-1);
  if (!entry) block(`no hay autorización de gobierno registrada para ${spec} en la sesión ${session} de este checkout.`);
  process.stdout.write(govStatement(entry));
}

const MODES = { record, gate, guard, developer, orchestrator, relay, secrets, statement: printStatement };
const mode = Object.hasOwn(MODES, process.argv[2]) ? MODES[process.argv[2]] : undefined;
if (!mode) block(`modo desconocido "${process.argv[2]}".`);
mode();
