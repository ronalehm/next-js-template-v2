// @vitest-environment node
// Run: npx vitest run .claude/hooks
import { afterAll, test, vi } from "vitest";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync, execSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const HOOK = join(import.meta.dirname, "spec-approval.mjs");

// Each case spawns the hook many times; on Windows that outlasts the default 5 s.
vi.setConfig({ testTimeout: 120_000 });

const tempDirs = [];
const COMMAND = /^apruebo\s+(?:\.[\\/])?docs[\\/]specs[\\/]([\w-]+)\.md$/i;
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function newKey() {
  const key = join(tempDir("spec-key-"), "id");
  execSync(`ssh-keygen -t ed25519 -N "" -q -f "${key}"`);
  return key;
}
const KEY = newKey();
const signersFor = (key, path) =>
  writeFileSync(path, `approver namespaces="spec-approval" ${readFileSync(`${key}.pub`, "utf8")}`);
const sign = (key, text, namespace = "spec-approval") =>
  spawnSync("ssh-keygen", ["-Y", "sign", "-f", key, "-n", namespace], { input: text, encoding: "utf8" }).stdout;

function project() {
  const dir = tempDir("spec-approval-");
  mkdirSync(join(dir, "docs/specs"), { recursive: true });
  execSync("git init -q && git config user.name Tester && git config user.email t@x.io", { cwd: dir });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, SPEC_APPROVAL_KEY_FILE: join(dir, "key"), SPEC_PRIVILEGED_FILE: join(dir, "privileged.jsonl"), SPEC_ALLOWED_SIGNERS: join(dir, "signers") };
  signersFor(KEY, env.SPEC_ALLOWED_SIGNERS);
  // The user's external signature, for every test that approves. "unsigned" models a prompt nobody confirmed.
  const signSpec = ({ prompt, cwd, unsigned }) => {
    const slug = (prompt ?? "").trim().match(COMMAND)?.[1];
    if (!slug || unsigned) return;
    const base = cwd ? execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8" }).trim() : dir;
    const text = spawnSync("node", [HOOK, "statement", `docs/specs/${slug}.md`], { input: JSON.stringify({ cwd }), env, encoding: "utf8" });
    if (text.status === 0) writeFileSync(join(base, `docs/specs/${slug}.md.sig`), sign(KEY, text.stdout));
  };
  // Same for "autorizo gobierno": the user signs the request the hook just recorded.
  const signGovernance = ({ prompt, unsigned, session_id }) => {
    const slug = (prompt ?? "").trim().match(/^autorizo\s+gobierno\s+docs\/specs\/([\w-]+)\.md$/i)?.[1];
    if (!slug || unsigned || !session_id) return;
    const text = spawnSync("node", [HOOK, "statement", `docs/specs/${slug}.md`, "gobierno", session_id], { input: "{}", env, encoding: "utf8" });
    if (text.status === 0) writeFileSync(join(dir, `docs/specs/${slug}.md.gov.sig`), sign(KEY, text.stdout));
  };
  const run = (mode, payload) => {
    if (mode === "record") signSpec(payload);
    const r = spawnSync("node", [HOOK, mode], { input: JSON.stringify(payload), env, encoding: "utf8" });
    if (mode === "record") signGovernance(payload);
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const spec = (name, body = "") =>
    writeFileSync(join(dir, `docs/specs/${name}.md`), `# ${name}\n\n- Estado: borrador\n\n- [ ] T1\n${body}`);
  const file = (name) => readFileSync(join(dir, `docs/specs/${name}.md`), "utf8");
  const write = (name, text) => writeFileSync(join(dir, `docs/specs/${name}.md`), text);
  const say = (prompt) => run("record", { prompt });
  const dev = (prompt) => run("gate", { tool_input: { subagent_type: "developer", prompt } });
  const ledger = join(dir, "docs/specs/approvals.jsonl");
  return { dir, env, ledger, run, spec, file, write, say, dev };
}

test("only the user's 'apruebo' unlocks developer, and records who approved", () => {
  const p = project();
  p.spec("users-list");
  assert.equal(p.dev("docs/specs/users-list.md").code, 2, "draft blocks");

  p.write("users-list", p.file("users-list").replace("borrador", "aprobado"));
  assert.equal(p.dev("docs/specs/users-list.md").code, 2, "agent-written aprobado without ledger blocks");

  p.spec("users-list");
  const r = p.say("apruebo docs/specs/users-list.md");
  assert.equal(r.code, 0);
  assert.match(r.out, /Tester <t@x.io>/);
  assert.match(r.out, /Continúa ahora con la implementación/);
  assert.match(p.file("users-list"), /Estado: aprobado/);
  const ledger = JSON.parse(readFileSync(join(p.dir, "docs/specs/approvals.jsonl"), "utf8"));
  assert.equal(ledger.approver, "Tester <t@x.io>");
  assert.equal(p.dev("docs/specs/users-list.md").code, 0, "approved passes");
});

test("ticking tasks keeps approval; editing the spec invalidates it", () => {
  const p = project();
  p.spec("a");
  p.say("apruebo docs/specs/a.md");
  p.write("a", p.file("a").replace("- [ ] T1", "- [x] T1"));
  assert.equal(p.dev("docs/specs/a.md").code, 0);
  p.write("a", p.file("a") + "- nuevo requisito\n");
  const r = p.dev("docs/specs/a.md");
  assert.equal(r.code, 2);
  assert.match(r.out, /cambió después de su aprobación/);
});

test("record: only 'apruebo docs/specs/<slug>.md' approves", () => {
  const p = project();
  p.spec("a");
  p.spec("b");
  assert.equal(p.say("no apruebo").code, 0, "normal message passes through");
  assert.equal(p.say("apruebo pero cambia X").code, 0, "normal message passes through");
  for (const attempt of ["apruebo", "apruebo b", "apruebo b.md"]) {
    const r = p.say(attempt);
    assert.equal(r.code, 2, `"${attempt}" is rejected`);
    assert.match(r.out, /apruebo docs\/specs\/<slug>\.md.*Pendientes: docs\/specs\/a\.md, docs\/specs\/b\.md/);
  }
  assert.match(p.file("a") + p.file("b"), /^(?![\s\S]*aprobado)/, "nothing approved yet");
  assert.match(p.say("apruebo docs/specs/nope.md").out, /no existe/);

  assert.equal(p.say("Apruebo docs\\specs\\b.md").code, 0, "windows path ok");
  assert.match(p.file("b"), /Estado: aprobado/);
  assert.match(p.file("a"), /Estado: borrador/);
  assert.match(p.say("apruebo docs/specs/b.md").out, /ya está aprobada/);
});

test("gate: build mode, other agents, missing spec, bad input", () => {
  const p = project();
  assert.equal(p.dev("Modo: build. Cambia un color").code, 0);
  assert.equal(p.dev("haz la feature").code, 2);
  assert.equal(p.dev("docs\\specs\\nope.md").code, 2);
  const other = spawnSync("node", [HOOK, "gate"], {
    input: JSON.stringify({ tool_input: { subagent_type: "reviewer", prompt: "x" } }),
    env: p.env,
  });
  assert.equal(other.status, 0);
  assert.equal(spawnSync("node", [HOOK, "gate"], { input: "not json", env: p.env }).status, 2, "fails closed");
});

test("signature: forged or foreign ledger lines are ignored", () => {
  const p = project();
  p.spec("a");
  p.say("apruebo docs/specs/a.md");
  assert.match(readFileSync(p.ledger, "utf8"), /"sig":"[0-9a-f]{64}"/);

  const original = p.file("a");
  const line = (obj) => `${JSON.stringify(obj)}\n`;

  // An agent edits the approved spec and appends a ledger line with a new hash, reusing the old sig.
  p.write("a", original + "- requisito colado\n");
  const entry = JSON.parse(readFileSync(p.ledger, "utf8"));
  appendFileSync(p.ledger, line({ ...entry, hash: "0".repeat(64) }));
  assert.match(p.dev("docs/specs/a.md").out, /cambió después de su aprobación/);

  // A hand-written line for a never-approved spec, without a valid signature.
  p.spec("b");
  p.write("b", p.file("b").replace("borrador", "aprobado"));
  appendFileSync(p.ledger, line({ spec: "docs/specs/b.md", hash: "x", approver: "Tester", date: "d", sig: "f".repeat(64) }));
  assert.match(p.dev("docs/specs/b.md").out, /firma válida/);

  // Ledger signed with another machine's key.
  p.write("a", original);
  assert.equal(p.dev("docs/specs/a.md").code, 0, "restored spec passes with this machine's key");
  writeFileSync(join(p.dir, "key"), "otra-clave");
  assert.match(p.dev("docs/specs/a.md").out, /firma válida/);
});

test("guard: Claude can only write specs as borrador", () => {
  const p = project();
  const guard = (tool_input) =>
    spawnSync("node", [HOOK, "guard"], { input: JSON.stringify({ tool_input }), env: p.env }).status;
  const path = join(p.dir, "docs/specs/a.md");

  assert.equal(guard({ file_path: path, content: "# A\n\n- Estado: borrador\n" }), 0, "new draft ok");
  assert.equal(guard({ file_path: path, content: "# A\n\n- Estado: aprobado\n" }), 2, "new approved blocked");
  assert.equal(guard({ file_path: path, content: "# A\n" }), 2, "spec without Estado blocked");
  assert.equal(guard({ file_path: path, old_string: "Estado: borrador", new_string: "Estado: aprobado" }), 2);
  assert.equal(guard({ file_path: path, old_string: "- Estado: borrador", new_string: "" }), 2, "removing Estado blocked");
  assert.equal(guard({ file_path: path, old_string: "Estado: aprobado", new_string: "Estado: borrador" }), 0, "back to draft ok");
  assert.equal(guard({ file_path: path, old_string: "- [ ] T1", new_string: "- [x] T1" }), 0, "ticking ok");
  assert.equal(guard({ file_path: path, edits: [{ old_string: "x", new_string: "Estado: aprobado" }] }), 2, "MultiEdit");
  assert.equal(guard({ file_path: join(p.dir, "README.md"), content: "Estado: aprobado" }), 0, "other files ignored");
  assert.equal(guard({ file_path: String.raw`C:\repo\docs\specs\a.md`, content: "Estado: aprobado" }), 2, "windows path");
});

test("developer: specs are read-only for the developer agent", () => {
  const p = project();
  const dev = (tool_name, tool_input) =>
    spawnSync("node", [HOOK, "developer"], { input: JSON.stringify({ tool_name, tool_input }), env: p.env }).status;
  const spec = join(p.dir, "docs/specs/a.md");

  assert.equal(dev("Edit", { file_path: spec, old_string: "- [ ] T1", new_string: "- [x] T1" }), 2);
  assert.equal(dev("Write", { file_path: join(p.dir, "docs/specs/approvals.jsonl"), content: "{}" }), 2);
  assert.equal(dev("Write", { file_path: String.raw`C:\repo\docs\specs\a.md`, content: "x" }), 2);
  assert.equal(dev("Bash", { command: "sed -i 's/borrador/aprobado/' docs/specs/a.md" }), 2);
  assert.equal(dev("Bash", { command: 'echo x > "./docs/specs/a.md"' }), 2);
  assert.equal(dev("Write", { file_path: join(p.dir, "modules/users/index.ts"), content: "x" }), 0);
  assert.equal(dev("Write", { file_path: join(p.dir, "docs/SETUP.md"), content: "x" }), 0);
  assert.equal(dev("Bash", { command: "npx vitest run modules/users" }), 0);
});

// Gobierno: la aprobación funcional nunca autoriza archivos que controlan a los agentes.

const SESSION = "session-1";

function governed(p, name = "g", { phase = "B", sensitive = [], governance = [], body = "" } = {}) {
  const list = (paths) => paths.map((path) => `- \`${path}\``).join("\n");
  p.write(
    name,
    `# ${name}\n\n- Estado: borrador\n- Fase actual: ${phase}\n\n` +
      `## Archivos sensibles\n${list(sensitive)}\n\n## Cambios de gobierno\n${list(governance)}\n\n` +
      `## Plan\n- [ ] T1\n${body}`,
  );
}

const say = (p, prompt, session = SESSION) => p.run("record", { prompt, session_id: session });
const approve = (p, name = "g") => say(p, `apruebo docs/specs/${name}.md`);
const authorize = (p, name = "g", session = SESSION) => say(p, `autorizo gobierno docs/specs/${name}.md`, session);
const write = (p, rel, session = SESSION) =>
  p.run("guard", { session_id: session, tool_input: { file_path: join(p.dir, rel), content: "x" } });
const launch = (p, subagent_type, prompt) => p.run("gate", { tool_input: { subagent_type, prompt } });

const GOVERNANCE = [
  ".claude/hooks/spec-approval.mjs",
  ".claude/hooks/spec-approval.test.mjs",
  ".claude/agents/developer.md",
  ".claude/rules/security.md",
  ".claude/skills/x/SKILL.md",
  ".claude/settings.json",
  ".claude/settings.local.json",
  "CLAUDE.md",
  "AGENTS.md",
  "docs/SETUP.md",
  "docs/specs/approvals.jsonl",
];

test("governance: functional approval never authorizes governance files, even if the spec cites them", () => {
  const p = project();
  governed(p, "g", { sensitive: GOVERNANCE, body: GOVERNANCE.join("\n") });
  assert.equal(approve(p).code, 0);
  for (const rel of GOVERNANCE) {
    const r = write(p, rel);
    assert.equal(r.code, 2, `${rel} blocked`);
    assert.match(r.out, /gobierno/);
  }
});

test("governance: privileged authorization is limited by scope, session and spec state", () => {
  const p = project();
  governed(p, "g", { governance: [".claude/settings.json", "docs/SETUP.md"] });
  assert.equal(authorize(p).code, 2, "requires functional approval first");
  assert.equal(existsSync(join(p.dir, "privileged.jsonl")), false, "nothing recorded");

  assert.equal(approve(p).code, 0);
  assert.equal(write(p, ".claude/settings.json").code, 2, "functional approval alone does not unlock");

  const r = authorize(p);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\.claude\/settings\.json/, "tells the user exactly what was unlocked");
  assert.equal(write(p, ".claude/settings.json").code, 0, "listed");
  assert.equal(write(p, "docs/SETUP.md").code, 0, "listed");
  assert.equal(write(p, ".claude/hooks/spec-approval.mjs").code, 2, "not listed");
  assert.equal(write(p, ".claude/settings.json", "other-session").code, 2, "other session");

  p.write("g", p.file("g") + "- requisito colado\n");
  assert.equal(write(p, ".claude/settings.json").code, 2, "spec changed after authorization");
});

test("governance: only the user's signature of this exact request unlocks it", () => {
  const p = project();
  governed(p, "g", { governance: ["CLAUDE.md", "docs/SETUP.md"] });
  approve(p);
  const govSig = join(p.dir, "docs/specs/g.md.gov.sig");
  const request = (session = SESSION) =>
    p.run("record", { prompt: "autorizo gobierno docs/specs/g.md", session_id: session, unsigned: true });
  const requestText = (session = SESSION) =>
    spawnSync("node", [HOOK, "statement", "docs/specs/g.md", "gobierno", session], { input: "{}", env: p.env, encoding: "utf8" }).stdout;
  const claudeMd = (session) => write(p, "CLAUDE.md", session).code;

  const r = request();
  assert.equal(r.code, 0);
  assert.match(r.out, /Falta firma externa/);
  assert.match(r.out, new RegExp(`statement docs/specs/g\\.md gobierno ${SESSION} `), "the printed command names its session");
  assert.equal(claudeMd(), 2, "record called directly, nobody signed");

  const copy = join(tempDir("spec-copy-"), "h.mjs");
  copyFileSync(HOOK, copy);
  const scripted = (session) =>
    spawnSync("node", [copy, "record"], {
      input: JSON.stringify({ prompt: "autorizo gobierno docs/specs/g.md", session_id: session }),
      env: p.env,
      encoding: "utf8",
    }).status;
  assert.equal(scripted(SESSION), 0, "the copy records a request");
  assert.equal(claudeMd(), 2, "a script running a copy of the hook gets nothing usable");

  const text = requestText();
  assert.equal(scripted("agent-session"), 0, "a later request from another session");
  assert.equal(requestText(), text, "the user still signs their own session's request");
  assert.match(text, /^spec-governance\n/);
  for (const field of ["spec: docs/specs/g.md", `sesion: ${SESSION}`, 'rutas: ["CLAUDE.md","docs/SETUP.md"]', "operacion: edit", "caduca: 20"]) {
    assert.ok(text.includes(field), field);
  }
  const noSession = spawnSync("node", [HOOK, "statement", "docs/specs/g.md", "gobierno"], { input: "{}", env: p.env, encoding: "utf8" });
  assert.equal(noSession.status, 2, "statement without a session");
  writeFileSync(govSig, "");
  assert.equal(claudeMd(), 2, "empty");
  writeFileSync(govSig, "not a signature");
  assert.equal(claudeMd(), 2, "garbage");
  writeFileSync(govSig, readFileSync(join(p.dir, "docs/specs/g.md.sig")));
  assert.equal(claudeMd(), 2, "the functional signature");
  writeFileSync(govSig, sign(KEY, text.replace("spec-governance", "spec-approval")));
  assert.equal(claudeMd(), 2, "same fields, functional header");
  writeFileSync(govSig, sign(newKey(), text));
  assert.equal(claudeMd(), 2, "another key");

  request("other-session");
  writeFileSync(govSig, sign(KEY, requestText("other-session")));
  assert.equal(claudeMd(), 2, "signed for another session");

  writeFileSync(govSig, sign(KEY, requestText()));
  assert.equal(claudeMd(), 0, "valid signature");
  assert.equal(write(p, "docs/SETUP.md").code, 0, "signed scope");
  assert.equal(write(p, ".claude/settings.json").code, 2, "outside the signed scope");
  assert.equal(claudeMd("other-session"), 2, "the other session's request stays unsigned");

  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: B").code, 0, "gate phase B unchanged");
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: C").code, 2, "gate phase C unchanged");
  p.write("g", p.file("g") + "- cambio\n");
  assert.equal(claudeMd(), 2, "spec changed after signing");
});

test("governance: privileged authorization rejects empty, foreign and ledger scopes", () => {
  const p = project();
  governed(p, "empty");
  approve(p, "empty");
  assert.equal(authorize(p, "empty").code, 2, "no paths listed");

  governed(p, "foreign", { governance: ["modules/users/index.ts"] });
  approve(p, "foreign");
  assert.equal(authorize(p, "foreign").code, 2, "only governance paths");

  governed(p, "ledger", { governance: ["docs/specs/approvals.jsonl"] });
  approve(p, "ledger");
  assert.equal(authorize(p, "ledger").code, 2, "ledgers can never be authorized");

  governed(p, "nosession", { governance: ["CLAUDE.md"] });
  approve(p, "nosession");
  assert.equal(p.run("record", { prompt: "autorizo gobierno docs/specs/nosession.md" }).code, 2, "needs a session");
});

test("governance: signatures of one approval type do not work as the other", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approve(p);
  const functional = readFileSync(p.ledger, "utf8");
  const entry = JSON.parse(functional);
  const file = join(p.dir, "privileged.jsonl");
  appendFileSync(
    file,
    `${JSON.stringify({ ...entry, paths: ["CLAUDE.md"], operation: "edit", session: SESSION, expires: Date.now() + 1e6 })}\n`,
  );
  assert.equal(write(p, "CLAUDE.md").code, 2, "functional signature replayed as privileged");

  authorize(p);
  assert.equal(write(p, "CLAUDE.md").code, 0);
  const privileged = readFileSync(file, "utf8").trim().split("\n").at(-1);
  writeFileSync(p.ledger, `${privileged}\n`);
  assert.equal(write(p, "proxy.ts").code, 2, "privileged signature replayed as functional");

  const { paths, operation, session, expires, approver, ...rest } = JSON.parse(privileged);
  const shifted = { ...rest, approver: [paths, operation, session, expires, approver].join("\n") };
  writeFileSync(p.ledger, `${JSON.stringify(shifted)}\n`);
  assert.equal(write(p, "proxy.ts").code, 2, "shifting field boundaries cannot replay a signature");
});

test("governance: an expired authorization stops working, even with a valid signature", () => {
  const p = project();
  governed(p, "g", { governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  const file = join(p.dir, "privileged.jsonl");
  const entry = JSON.parse(readFileSync(file, "utf8"));
  const forge = (expires) => {
    const sig = createHmac("sha256", readFileSync(join(p.dir, "key"), "utf8").trim())
      .update(
        ["privileged", resolve(p.dir), entry.spec, entry.hash, entry.phase, entry.paths.join(","), entry.operation, entry.session, expires, entry.approver, entry.date].join("\n"),
      )
      .digest("hex");
    writeFileSync(file, `${JSON.stringify({ ...entry, expires, sig })}\n`);
    const text = spawnSync("node", [HOOK, "statement", "docs/specs/g.md", "gobierno", SESSION], { input: "{}", env: p.env, encoding: "utf8" }).stdout;
    writeFileSync(join(p.dir, "docs/specs/g.md.gov.sig"), sign(KEY, text));
  };
  forge(Date.now() - 1000);
  assert.equal(write(p, "CLAUDE.md").code, 2);
  forge(Date.parse(entry.date) + 365 * 24 * 60 * 60 * 1000);
  assert.equal(write(p, "CLAUDE.md").code, 2, "a request longer than 2 hours, even signed");
});

test("governance: aliases of protected paths are still protected", () => {
  const p = project();
  const guard = (tool_input) => p.run("guard", { session_id: SESSION, tool_input }).code;
  assert.equal(guard({ file_path: `${p.dir}/.claude/x/../settings.json`, content: "x" }), 2, "dot segments");
  assert.equal(guard({ file_path: `${p.dir}/docs/specs/x/../a.md`, content: "- Estado: aprobado\n" }), 2, "dot segments in a spec");
  assert.equal(guard({ file_path: join(p.dir, ".CLAUDE/SETTINGS.JSON"), content: "x" }), 2, "case");
  assert.equal(guard({ file_path: String.raw`C:\repo\.claude\hooks\spec-approval.mjs`, content: "x" }), 2, "windows path");
  assert.equal(guard({ notebook_path: join(p.dir, ".claude/skills/x/a.ipynb"), new_source: "x" }), 2, "notebook");
  assert.equal(guard({ file_path: join(p.dir, ".claude/plans/x.md"), content: "x" }), 0, "unrelated .claude path");

  mkdirSync(join(p.dir, ".claude"), { recursive: true });
  writeFileSync(join(p.dir, ".claude/settings.json"), "{}");
  try {
    symlinkSync(join(p.dir, ".claude/settings.json"), join(p.dir, "link.json"));
  } catch {
    return; // Windows sin privilegio de symlink: el caso se cubre en sesión real.
  }
  assert.equal(guard({ file_path: join(p.dir, "link.json"), content: "x" }), 2, "symlink");
});

test("sensitive: only the listed files of an approved spec unlock, also under Modo: build", () => {
  const p = project();
  assert.equal(launch(p, "developer", "Modo: build. Edita proxy.ts").code, 0, "the prompt alone is not the control");
  for (const rel of ["proxy.ts", "middleware.ts", ".env", ".env.local", "lib/auth.ts", "lib/roles.ts", "lib/db.ts", "db/migrations/1.sql", "migrations/1.sql", "prisma/schema.prisma", "drizzle/a.ts", "scripts/db-migrate.mjs", ".github/workflows/ci.yml", "app/auth/page.tsx", "modules/auth/index.ts", "modules/users/auth.service.ts"]) {
    assert.equal(write(p, rel).code, 2, `${rel} blocked without a spec`);
  }
  for (const rel of ["README.md", "modules/users/index.ts", "modules/authors/a.ts", ".env.example", "app/page.tsx", "lib/utils.ts"]) {
    assert.equal(write(p, rel).code, 0, `${rel} is not sensitive`);
  }

  governed(p, "g", { sensitive: ["proxy.ts"], body: "`lib/auth.ts` solo se menciona aquí\n" });
  assert.equal(write(p, "proxy.ts").code, 2, "draft does not unlock");
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 0, "listed");
  assert.equal(write(p, "lib/auth.ts").code, 2, "a mention outside the section does not unlock");

  p.write("g", p.file("g") + "- cambio\n");
  assert.equal(write(p, "proxy.ts").code, 2, "spec changed after approval");
});

test("phases: an approval only covers the current phase", () => {
  const p = project();
  governed(p, "g", { phase: "B", sensitive: ["proxy.ts"] });
  approve(p);
  assert.equal(launch(p, "developer", "docs/specs/g.md").code, 2, "phase not declared");
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: C").code, 2, "other phase");
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: B").code, 0, "current phase");

  p.write("g", p.file("g").replace("Fase actual: B", "Fase actual: C"));
  const r = launch(p, "developer", "docs/specs/g.md Fase: C");
  assert.equal(r.code, 2, "moving the phase requires a new approval");
  assert.match(r.out, /cambió después de su aprobación/);
  assert.equal(write(p, "proxy.ts").code, 2);
});

test("gate: any implementing agent is checked, not only developer", () => {
  const p = project();
  p.spec("a");
  for (const type of ["general-purpose", "caveman:cavecrew-builder", undefined]) {
    assert.equal(launch(p, type, "Implementa docs/specs/a.md").code, 2, `${type} with a draft`);
  }
  for (const type of ["reviewer", "spec", "Explore", "Plan"]) {
    assert.equal(launch(p, type, "docs/specs/a.md").code, 0, `${type} does not implement`);
  }
  assert.equal(launch(p, "general-purpose", "investiga algo").code, 0, "no spec cited");
  p.say("apruebo docs/specs/a.md");
  assert.equal(launch(p, "general-purpose", "Implementa docs/specs/a.md").code, 0, "approved");
});

test("root: inside a worktree, specs and ledger resolve there and not in CLAUDE_PROJECT_DIR", () => {
  const p = project();
  execSync("git commit -q --allow-empty -m base", { cwd: p.dir });
  const tree = join(tempDir("spec-tree-"), "wt");
  execSync(`git worktree add -q "${tree}"`, { cwd: p.dir });
  mkdirSync(join(tree, "docs/specs/deep"), { recursive: true });
  writeFileSync(join(tree, "docs/specs/w.md"), "# w\n\n- Estado: borrador\n");

  const cwd = join(tree, "docs/specs/deep");
  const r = p.run("record", { prompt: "apruebo docs/specs/w.md", cwd });
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(tree, "docs/specs/w.md"), "utf8"), /Estado: aprobado/);
  assert.ok(existsSync(join(tree, "docs/specs/approvals.jsonl")), "ledger in the worktree");
  assert.equal(existsSync(p.ledger), false, "main checkout untouched");
  assert.equal(p.run("gate", { cwd, tool_input: { subagent_type: "developer", prompt: "docs/specs/w.md" } }).code, 0);
  assert.equal(p.run("gate", { tool_input: { subagent_type: "developer", prompt: "docs/specs/w.md" } }).code, 2, "other root");
});

test("root: an approval copied to another checkout is not valid there", () => {
  const a = project();
  a.spec("x");
  a.say("apruebo docs/specs/x.md");
  const b = project();
  b.write("x", a.file("x"));
  writeFileSync(b.ledger, readFileSync(a.ledger, "utf8"));
  writeFileSync(join(b.dir, "key"), readFileSync(join(a.dir, "key"), "utf8"));
  const r = b.dev("docs/specs/x.md");
  assert.equal(r.code, 2);
  assert.match(r.out, /firma válida/);
});

test("integrity: blocks approvals and protected writes when another copy of the hook is running", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"] });
  const copy = join(p.dir, ".claude/hooks/spec-approval.mjs");
  mkdirSync(join(p.dir, ".claude/hooks"), { recursive: true });

  writeFileSync(copy, "// otra versión\n");
  assert.match(approve(p).out, /otra copia del hook/);
  assert.match(p.file("g"), /Estado: borrador/, "nothing approved");
  assert.match(write(p, "proxy.ts").out, /otra copia del hook/);
  assert.match(launch(p, "developer", "docs/specs/g.md").out, /otra copia del hook/);
  assert.equal(say(p, "hola").code, 0, "normal prompts pass");
  assert.equal(write(p, "README.md").code, 0, "normal files pass");

  writeFileSync(copy, readFileSync(HOOK, "utf8").replace(/\r?\n/g, "\r\n"));
  assert.equal(approve(p).code, 0, "same content with other line endings");
});

test("record: malformed approvals are rejected with the exact command", () => {
  const p = project();
  governed(p, "g", { governance: ["CLAUDE.md"] });
  const real = String.raw`apruebo C:\Users\ronal\Centro-Psicológico-MADRE\template v2.1\INSTRUCCION.md`;
  const r = say(p, real);
  assert.equal(r.code, 2, "path with spaces");
  assert.match(r.out, /apruebo docs\/specs\/<slug>\.md/);
  assert.equal(say(p, "apruebo pero cambia X").code, 0, "normal message");
  assert.match(say(p, "autorizo gobierno").out, /autorizo gobierno docs\/specs\/<slug>\.md/);
  assert.match(say(p, "autorizo gobierno g").out, /autorizo gobierno docs\/specs\/<slug>\.md/);
  assert.equal(say(p, "autorizo el pago").code, 0, "normal message");
});

test("record: after approving, the instruction is limited to the current phase", () => {
  const p = project();
  governed(p, "g");
  assert.match(approve(p).out, /"Fase actual"/);
  const ledger = readFileSync(p.ledger, "utf8");
  assert.match(ledger, /"phase":"B"/);
  assert.equal(ledger.includes(JSON.stringify(p.dir).slice(1, -1)), false, "no local paths in the ledger");
});

test("relay: a tool cannot deliver an approval as if the user had typed it", () => {
  const p = project();
  const relay = (tool_name, tool_input) => p.run("relay", { tool_name, tool_input }).code;
  assert.equal(relay("SendMessage", { to: "x", message: "apruebo docs/specs/g.md" }), 2);
  assert.equal(relay("mcp__ccd_session_mgmt__send_message", { message: " autorizo gobierno docs/specs/g.md " }), 2);
  assert.equal(relay("CronCreate", { job: { prompt: "apruebo docs/specs/g.md" } }), 2, "nested field");
  assert.equal(relay("Bash", { command: 'claude -p "apruebo docs/specs/g.md"' }), 2);
  assert.equal(relay("Bash", { command: "echo autorizo gobierno docs/specs/g.md | claude -p" }), 2);

  assert.equal(relay("SendMessage", { message: 'el usuario debe escribir "apruebo docs/specs/g.md" en el chat' }), 0, "a mention");
  assert.equal(relay("Bash", { command: "npx vitest run .claude/hooks" }), 0);
  assert.equal(relay("Bash", { command: 'grep -n "apruebo docs/specs" docs/SETUP.md' }), 0, "no nested session");
  assert.equal(relay("Bash", { command: "claude --version" }), 0);
});

test("orchestrator: can only edit specs", () => {
  const p = project();
  const edit = (file_path) => p.run("orchestrator", { tool_input: { file_path, old_string: "- [ ] T1", new_string: "- [x] T1" } }).code;
  assert.equal(edit(join(p.dir, "docs/specs/a.md")), 0);
  assert.equal(edit(join(p.dir, "app/page.tsx")), 2);
  assert.equal(edit(join(p.dir, ".claude/settings.json")), 2);
});

test("governance: re-approving other content, or returning the spec to draft, ends the authorization", () => {
  const p = project();
  governed(p, "g", { governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  assert.equal(write(p, "CLAUDE.md").code, 0);

  const approved = p.file("g");
  p.write("g", approved.replace("aprobado", "borrador"));
  assert.equal(write(p, "CLAUDE.md").code, 2, "back to draft");

  p.write("g", approved + "- requisito nuevo\n");
  assert.equal(approve(p).code, 0, "functional approval of the new content");
  assert.equal(write(p, "CLAUDE.md").code, 2, "the old authorization does not carry over");
  assert.equal(authorize(p).code, 0);
  assert.equal(write(p, "CLAUDE.md").code, 0, "a new authorization does");
});

// Hallazgos de la revisión independiente de Fase B.

test("aliases: NTFS streams, trailing dots and relative paths do not escape protection", () => {
  const p = project();
  const guard = (tool_input, extra = {}) => p.run("guard", { session_id: SESSION, tool_input, ...extra }).code;
  for (const alias of ["CLAUDE.md::$DATA", ".claude/settings.json::$DATA", ".claude::$INDEX_ALLOCATION/settings.json", "docs/specs/approvals.jsonl::$DATA", "CLAUDE.md.", "CLAUDE.md ", ".claude./settings.json"]) {
    assert.equal(guard({ file_path: `${p.dir}/${alias}`, content: "x" }), 2, alias);
  }
  assert.equal(guard({ file_path: `${p.dir}/docs/specs/a.md::$DATA`, content: "- Estado: aprobado\n" }), 2, "spec stream");
  assert.equal(guard({ file_path: `${p.dir}/proxy.ts::$DATA`, content: "x" }), 2, "sensitive stream");

  mkdirSync(join(p.dir, ".claude"), { recursive: true });
  assert.equal(guard({ file_path: "settings.json", content: "x" }, { cwd: join(p.dir, ".claude") }), 2, "relative to cwd");
  assert.equal(guard({ file_path: join(p.dir, "README.md"), content: "x" }), 0, "normal file");
});

test("sensitive: files of another checkout or a nested repo are protected too", () => {
  const p = project();
  const other = project();
  writeFileSync(join(other.dir, "proxy.ts"), "x");
  const guard = (file_path, cwd = p.dir) => p.run("guard", { cwd, tool_input: { file_path, content: "x" } }).code;

  assert.equal(guard(join(other.dir, "proxy.ts")), 2, "other checkout, existing file");
  assert.equal(guard(join(other.dir, ".env")), 2, "other checkout, new file");
  assert.equal(guard(join(other.dir, "README.md")), 0, "other checkout, normal file");

  const nested = join(p.dir, "nested");
  mkdirSync(nested);
  execSync("git init -q", { cwd: nested });
  assert.equal(guard(join(p.dir, "proxy.ts"), nested), 2, "cwd in a nested repo");

  const plain = tempDir("spec-plain-");
  assert.equal(guard(join(plain, "proxy.ts")), 0, "outside any repo");
});

test("sensitive: auth in any code file, and runtime variants of the entry points", () => {
  const p = project();
  for (const rel of ["modules/users/hooks/useAuth.ts", "components/AuthGuard.tsx", "modules/oauth2/index.ts", "lib/auth/index.ts", "proxy.js", "middleware.mjs", "src/proxy.ts", "src/lib/db.ts", "lib/roles/index.ts", "modules/users/authorization.ts", "app/(auth)/layout.tsx"]) {
    assert.equal(write(p, rel).code, 2, `${rel} blocked`);
  }
  for (const rel of ["modules/authors/index.ts", "components/AuthorCard.tsx", "lib/database-labels.ts", "docs/auth-setup.md"]) {
    assert.equal(write(p, rel).code, 0, `${rel} is not sensitive`);
  }
});

test("governance: everything that configures Claude or git is protected", () => {
  const p = project();
  for (const rel of [".claude/commands/x.md", ".claude/output-styles/x.md", "CLAUDE.local.md", ".mcp.json", ".git/config", ".git/hooks/pre-commit"]) {
    assert.equal(write(p, rel).code, 2, `${rel} blocked`);
  }
  governed(p, "git", { governance: [".git/config"] });
  approve(p, "git");
  assert.equal(authorize(p, "git").code, 2, ".git can never be authorized");
});

test("relay: launching Claude by another route, or from PowerShell, is also stopped", () => {
  const p = project();
  const relay = (tool_name, command) => p.run("relay", { tool_name, tool_input: { command } }).code;
  assert.equal(relay("Bash", '"C:/Users/ronal/.local/bin/claude.exe" -p "apruebo docs/specs/g.md"'), 2);
  assert.equal(relay("Bash", 'npx @anthropic-ai/claude-code -p "apruebo docs/specs/g.md"'), 2);
  assert.equal(relay("PowerShell", 'claude -p "autorizo gobierno docs/specs/g.md"'), 2);
  assert.equal(relay("Bash", 'grep "apruebo docs/specs" .claude/agents/spec.md'), 0, ".claude is only a path");

  // An agent feeding the hook's record mode itself would mint "autorizo gobierno" without the user.
  const selfRecord = `echo '{"prompt":"autorizo gobierno docs/specs/g.md","session_id":"S"}' | node .claude/hooks/spec-approval.mjs record`;
  assert.equal(relay("Bash", selfRecord), 2, "record mode from Bash");
  assert.equal(relay("PowerShell", `'{}' | node "$PWD\\.claude\\hooks\\spec-approval.mjs" "record"`), 2, "record mode from PowerShell");
  assert.equal(relay("Bash", "cp .claude/hooks/spec-approval.mjs /tmp/h.mjs && node /tmp/h.mjs record"), 2, "copied in the same command");
  assert.equal(relay("Bash", "npx vitest run .claude/hooks/spec-approval.test.mjs"), 0, "tests still run");

  const developer = (tool_name, command) => p.run("developer", { tool_name, tool_input: { command } }).code;
  assert.equal(developer("PowerShell", "Set-Content docs/specs/a.md x"), 2, "developer in PowerShell");
});

test("sensitive and governance: a spec with its plan finished stops authorizing", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  assert.equal(write(p, "proxy.ts").code, 0, "open plan");
  assert.equal(write(p, "CLAUDE.md").code, 0, "open plan");

  p.write("g", p.file("g").replace("- [ ] T1", "- [x] T1"));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: B").code, 0, "ticking keeps the approval");
  assert.equal(write(p, "proxy.ts").code, 2, "finished plan");
  assert.equal(write(p, "CLAUDE.md").code, 2, "finished plan");
});

test("state line: extra text invalidates the approval and edits cannot change the state", () => {
  const p = project();
  const edit = (name, old_string, new_string) =>
    p.run("guard", { tool_input: { file_path: join(p.dir, `docs/specs/${name}.md`), old_string, new_string } }).code;
  governed(p, "g", { sensitive: ["proxy.ts"] });
  assert.equal(edit("g", "borrador", "aprobado"), 2, "word-level edit to approved");

  approve(p);
  assert.equal(edit("g", "aprobado", "aprobado (ampliado: reescribe proxy.ts)"), 2, "extra text by edit");
  assert.equal(edit("g", "- [ ] T1", "- [x] T1"), 0, "ticking an approved spec");
  assert.equal(edit("g", "aprobado", "borrador"), 0, "back to draft");

  p.write("g", p.file("g").replace("Estado: aprobado", "Estado: aprobado (ampliado)"));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: B").code, 2, "hash covers extra text");
});

test("governance: restoring earlier content does not revive an old authorization", () => {
  const p = project();
  governed(p, "g", { governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  const original = p.file("g");
  p.write("g", original + "- otro\n");
  approve(p);
  p.write("g", original);
  approve(p);
  assert.equal(write(p, "CLAUDE.md").code, 2);
});

test("sections: only the exact heading counts", () => {
  const p = project();
  p.write(
    "g",
    "# g\n\n- Estado: borrador\n\n## Archivos sensibles excluidos (NO tocar)\n- `lib/auth.ts`\n\n## Archivos sensibles\n- `proxy.ts`\n\n## Plan\n- [ ] T1\n",
  );
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 0);
  assert.equal(write(p, "lib/auth.ts").code, 2);
});

test("phases: dotted names and several specs in one prompt work", () => {
  const p = project();
  governed(p, "a", { phase: "B.1" });
  governed(p, "b", { phase: "C" });
  approve(p, "a");
  approve(p, "b");
  assert.equal(launch(p, "developer", "docs/specs/a.md Fase: B.1").code, 0);
  assert.equal(launch(p, "developer", "docs/specs/a.md Fase: B.1.").code, 0, "sentence punctuation");
  assert.equal(launch(p, "developer", "docs/specs/a.md Fase: B").code, 2);
  assert.equal(launch(p, "developer", "docs/specs/a.md Fase: B.1, docs/specs/b.md Fase: C").code, 0);
  assert.equal(launch(p, "developer", "docs/specs/a.md docs/specs/b.md Fase: C").code, 2);
});

// Hallazgos de la segunda revisión independiente de Fase B.

test("aliases: drive-relative, device and MSYS forms do not escape protection", () => {
  const p = project();
  const guard = (file_path) => p.run("guard", { cwd: p.dir, session_id: SESSION, tool_input: { file_path, content: "x" } }).code;
  for (const alias of ["C:CLAUDE.md", "C:.claude/settings.json", "C:docs/SETUP.md", "C:proxy.ts"]) {
    assert.equal(guard(alias), 2, alias);
  }
  for (const prefix of ["\\\\?\\", "\\\\.\\", "//?/", "//./"]) {
    assert.equal(guard(`${prefix}${p.dir}/proxy.ts`), 2, `${prefix} sensitive`);
    assert.equal(guard(`${prefix}${p.dir}/CLAUDE.md`), 2, `${prefix} governance`);
  }
  if (process.platform === "win32") {
    const msys = `/${p.dir[0].toLowerCase()}${p.dir.slice(2).replace(/\\/g, "/")}`;
    assert.equal(guard(`${msys}/lib/auth.ts`), 2, "MSYS sensitive");
    assert.equal(guard(`${msys}/README.md`), 0, "MSYS normal file");
  }
  assert.equal(guard("README.md"), 0, "normal relative file");
});

test("sensitive: a worktree nested in the main checkout is another repo, for every rule", () => {
  const p = project();
  execSync("git commit -q --allow-empty -m base", { cwd: p.dir });
  const tree = join(p.dir, ".claude/worktrees/w1");
  execSync(`git worktree add -q "${tree}"`, { cwd: p.dir });
  const guard = (rel, cwd = p.dir) => p.run("guard", { cwd, tool_input: { file_path: join(tree, rel), content: "x" } }).code;
  for (const rel of ["lib/auth.ts", "modules/auth/i.ts", "proxy.ts", "db/a.sql"]) {
    assert.equal(guard(rel), 2, `${rel} from the main checkout`);
  }
  assert.equal(guard("README.md"), 0, "normal file");

  writeFileSync(join(tree, "x.md"), "");
  mkdirSync(join(tree, "docs/specs"), { recursive: true });
  writeFileSync(join(tree, "docs/specs/w.md"), "# w\n\n- Estado: borrador\n\n## Archivos sensibles\n- `lib/auth.ts`\n\n## Plan\n- [ ] T1\n");
  assert.equal(p.run("record", { prompt: "apruebo docs/specs/w.md", cwd: tree }).code, 0);
  assert.equal(guard("lib/auth.ts", tree), 0, "its own session, listed");
  assert.equal(guard("lib/auth.ts"), 2, "the approval does not cross checkouts");
});

test("plan: unticking an approved spec cannot reopen it", () => {
  const p = project();
  const edit = (old_string, new_string) =>
    p.run("guard", { tool_input: { file_path: join(p.dir, "docs/specs/g.md"), old_string, new_string } }).code;
  governed(p, "g", { sensitive: ["proxy.ts"] });
  approve(p);
  assert.equal(edit("- [ ] T1", "- [x] T1"), 0, "ticking");
  p.write("g", p.file("g").replace("- [ ] T1", "- [x] T1"));
  assert.equal(write(p, "proxy.ts").code, 2, "finished");
  assert.equal(edit("- [x] T1", "- [ ] T1"), 2, "unticking");
});

test("plan: only checkboxes in the plan section count, and authorizing a finished spec is refused", () => {
  const p = project();
  p.write("g", "# g\n\n- Estado: borrador\n\n## Archivos sensibles\n- `proxy.ts`\n\n## Cambios de gobierno\n- `CLAUDE.md`\n\n## Plan\n- [x] T1\n\n## Notas\n- [ ] otra\n");
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 2, "a box outside the plan");
  assert.equal(authorize(p).code, 2, "finished plan");
});

test("sections: a heading inside a code block does not count", () => {
  const p = project();
  p.write("g", "# g\n\n- Estado: borrador\n\n```md\n## Archivos sensibles\n- `proxy.ts`\n```\n\n## Plan\n- [ ] T1\n");
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 2);
});

test("patterns: variants documented in SETUP are covered, without false positives", () => {
  const p = project();
  for (const rel of [".envrc", ".env_local", "lib/dbs.ts", "lib/rolesx.ts", "proxy.tsx", ".git"]) {
    assert.equal(write(p, rel).code, 2, `${rel} blocked`);
  }
  for (const rel of [".gitignore", ".gitattributes", "lib/data.ts", "components/Roles.tsx"]) {
    assert.equal(write(p, rel).code, 0, `${rel} is not protected`);
  }
});

test("usability: phase markup and reading CLAUDE.md are not blocked", () => {
  const p = project();
  governed(p, "g", { phase: "C" });
  approve(p);
  for (const declared of ['"Fase: C"', "`Fase: C`", "**Fase: C**"]) {
    assert.equal(launch(p, "developer", `docs/specs/g.md ${declared}`).code, 0, declared);
  }
  const relay = (command) => p.run("relay", { tool_name: "Bash", tool_input: { command } }).code;
  assert.equal(relay('grep -n "apruebo docs/specs" CLAUDE.md'), 0);
  assert.equal(relay('grep -n "apruebo docs/specs" CLAUDE.local.md'), 0);
  assert.equal(relay('claude -p "apruebo docs/specs/g.md"'), 2);
});

// R7: el comando en el chat y su HMAC no prueban consentimiento humano.

test("external confirmation: an approval nobody signed unlocks nothing", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  const r = p.run("record", { prompt: "apruebo docs/specs/g.md", unsigned: true, session_id: SESSION });
  assert.equal(r.code, 0);
  assert.match(r.out, /falta firma externa/);
  assert.doesNotMatch(r.out, /Continúa ahora/);
  assert.match(readFileSync(p.ledger, "utf8"), /"sig":/, "the hook still wrote its signed line");
  const blocked = launch(p, "developer", "docs/specs/g.md Fase: B");
  assert.equal(blocked.code, 2);
  assert.match(blocked.out, /firma externa/);
  assert.equal(write(p, "proxy.ts").code, 2);
  assert.equal(authorize(p).code, 2);
});

test("external confirmation: only a valid signature of this content counts", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"] });
  const sig = join(p.dir, "docs/specs/g.md.sig");
  const statement = () => spawnSync("node", [HOOK, "statement", "docs/specs/g.md"], { input: "{}", env: p.env, encoding: "utf8" }).stdout;
  const gate = () => launch(p, "developer", "docs/specs/g.md Fase: B").code;
  p.run("record", { prompt: "apruebo docs/specs/g.md", unsigned: true });
  const text = statement();

  writeFileSync(sig, sign(newKey(), text));
  assert.equal(gate(), 2, "another key");
  writeFileSync(sig, sign(KEY, text, "other-namespace"));
  assert.equal(gate(), 2, "another namespace");
  writeFileSync(sig, sign(KEY, text.replace("\nB\n", "\nC\n")));
  assert.equal(gate(), 2, "another phase");
  writeFileSync(sig, "not a signature");
  assert.equal(gate(), 2, "garbage");

  writeFileSync(sig, sign(KEY, text));
  assert.equal(gate(), 0, "valid signature");
  assert.equal(write(p, "proxy.ts").code, 0);

  rmSync(p.env.SPEC_ALLOWED_SIGNERS);
  assert.equal(gate(), 2, "no signers file fails closed");
  signersFor(KEY, p.env.SPEC_ALLOWED_SIGNERS);

  p.write("g", p.file("g") + "- cambio\n");
  assert.equal(gate(), 2, "content changed");
});

// Git Bash's own tools, so the printed command runs as the user runs it (and not under WSL's bash).
const BIN = process.platform === "win32" ? resolve(execSync("git --exec-path", { encoding: "utf8" }).trim(), "../../../usr/bin") : "/usr/bin";
const tool = (name) => join(BIN, process.platform === "win32" ? `${name}.exe` : name);

test("external confirmation: the printed sign command signs only a checked statement", () => {
  const p = project();
  governed(p, "g", { sensitive: ["proxy.ts"] });
  const command = p.run("record", { prompt: "apruebo docs/specs/g.md", unsigned: true }).out.match(/raíz del repo: (.+)$/m)[1];
  const home = tempDir("spec-home-");
  mkdirSync(join(home, ".ssh"));
  mkdirSync(join(home, ".claude"));
  const key = join(home, ".ssh/spec_approval");
  execSync(`ssh-keygen -t ed25519 -N "" -q -f "${key}"`);
  const signers = join(home, ".claude/spec-allowed-signers");
  signersFor(key, signers);
  signersFor(key, p.env.SPEC_ALLOWED_SIGNERS);
  mkdirSync(join(p.dir, ".claude/hooks"), { recursive: true });
  copyFileSync(HOOK, join(p.dir, ".claude/hooks/spec-approval.mjs"));
  const sig = join(p.dir, "docs/specs/g.md.sig");
  writeFileSync(sig, "previous");
  const pathKey = Object.keys(p.env).find((k) => k.toUpperCase() === "PATH");
  const sh = (fakeNode) => {
    const bin = tempDir("spec-bin-");
    if (fakeNode) copyFileSync(tool(fakeNode), join(bin, "node.exe"));
    const env = { ...p.env, HOME: home, [pathKey]: [bin, BIN, p.env[pathKey]].join(delimiter) };
    const r = spawnSync(tool("bash"), ["-c", command], { cwd: p.dir, env, encoding: "utf8" });
    return r.stdout + r.stderr;
  };
  const gate = () => launch(p, "developer", "docs/specs/g.md Fase: B").code;

  assert.match(sh("false"), /ERROR: firma no creada/, "node.exe fails");
  assert.equal(readFileSync(sig, "utf8"), "previous");
  assert.match(sh("true"), /ERROR: firma no creada/, "empty statement");
  assert.equal(readFileSync(sig, "utf8"), "previous");
  assert.equal(gate(), 2);
  if (process.platform !== "win32") return; // node.exe exists only on Windows.

  signersFor(newKey(), signers);
  assert.match(sh(), /ERROR: firma no creada/, "signature that does not verify");
  assert.equal(readFileSync(sig, "utf8"), "previous");
  signersFor(key, signers);
  assert.match(sh(), /Firma verificada/);
  assert.equal(gate(), 0);
});

test("external confirmation: key material and signers are out of reach of Write and Edit", () => {
  const p = project();
  governed(p, "g", { sensitive: ["spec-allowed-signers"], governance: ["spec-allowed-signers"] });
  approve(p);
  assert.equal(authorize(p).code, 2, "cannot be authorized");
  const guard = (file_path) => p.run("guard", { session_id: SESSION, tool_input: { file_path, content: "x" } }).code;
  assert.equal(guard(join(p.dir, "spec-allowed-signers")), 2);
  assert.equal(guard(join(homedir(), ".claude/spec-allowed-signers")), 2);
  assert.equal(guard(join(homedir(), ".ssh/spec_approval")), 2);
});

// R4: las restricciones de agente no dependen de que su frontmatter cargue.

test("agent limits: settings hooks enforce them by agent_type", () => {
  const p = project();
  const guard = (agent_type, rel) =>
    p.run("guard", { agent_type, session_id: SESSION, tool_name: "Edit", tool_input: { file_path: join(p.dir, rel), old_string: "a", new_string: "b" } }).code;
  assert.equal(guard("orchestrator", "README.md"), 2);
  assert.equal(guard("orchestrator", "docs/specs/a.md"), 0);
  assert.equal(guard("developer", "docs/specs/a.md"), 2);
  assert.equal(guard("developer", "README.md"), 0);
  assert.equal(guard(undefined, "README.md"), 0);
  const shell = (agent_type, tool_name, command) => p.run("relay", { agent_type, tool_name, tool_input: { command } }).code;
  assert.equal(shell("developer", "Bash", "wc -l docs/specs/approvals.jsonl"), 2);
  assert.equal(shell("developer", "PowerShell", "Set-Content docs/specs/a.md x"), 2);
  assert.equal(shell("developer", "Bash", "npx vitest run"), 0);
  assert.equal(shell(undefined, "Bash", "wc -l docs/specs/approvals.jsonl"), 0);
});
