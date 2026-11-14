// @vitest-environment node
// Run: npx vitest run .claude/hooks
import { afterAll, test, vi } from "vitest";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync, execSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  "docs/uat/product-agent.md",
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

test("governance: docs/uat/product-agent.md needs privileged authorization, scoped to the listed file", () => {
  const p = project();
  governed(p, "g", { governance: ["docs/uat/product-agent.md"] });
  assert.equal(approve(p).code, 0);
  assert.equal(write(p, "docs/uat/product-agent.md").code, 2, "functional approval alone does not unlock");
  assert.equal(authorize(p).code, 0);
  assert.equal(write(p, "docs/uat/product-agent.md").code, 0, "listed + authorized");
  assert.equal(write(p, "docs/uat/product-agent.md", "other-session").code, 2, "other session");
  assert.equal(write(p, "docs/uat/other.md").code, 2, "unlisted uat file");
  assert.equal(write(p, "docs/evidence/x.md").code, 0, "normal path untouched");
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

test("product agent: read-only, blocked on every write and delegation tool", () => {
  const p = project();
  const write = (tool_name, rel) =>
    p.run("guard", { agent_type: "product", session_id: SESSION, tool_name, tool_input: { file_path: join(p.dir, rel), old_string: "a", new_string: "b", content: "x" } }).code;
  for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
    for (const rel of ["README.md", "docs/evidence/a.md", "docs/specs/a.md", ".claude/settings.json", ".claude/settings.local.json", ".claude/agents/product.md"]) {
      assert.equal(write(tool, rel), 2, `${tool} ${rel}`);
    }
  }
  const relay = (tool_name, tool_input = { command: "ls" }, ...agent) =>
    p.run("relay", { agent_type: agent.length ? agent[0] : "product", tool_name, tool_input }).code;
  for (const tool of ["Bash", "PowerShell", "mcp__terminal__run"]) assert.equal(relay(tool), 2, tool);
  assert.equal(relay("Bash", { command: "claude --dangerously-skip-permissions" }), 2);
  assert.equal(relay("Agent", { subagent_type: "developer", prompt: "x" }), 2);
  for (const tool of ["SendMessage", "CronCreate", "RemoteTrigger", "mcp__scheduled-tasks__create", "mcp__ccd_session_mgmt__send_message", "mcp__ccd_session__start_session", "mcp__ccd_session__hand_off_to_session"]) {
    assert.equal(relay(tool, { x: "y" }), 2, tool);
  }
  // AC-04 rewritten as allowlist (AC-C11): ls is outside C1, git status is inside; PowerShell stays read-only blocked.
  assert.equal(relay("Bash", { command: "ls" }), 2);
  assert.equal(relay("Bash", { command: "git status" }), 0);
  const reason = p.run("relay", { agent_type: "product", tool_name: "PowerShell", tool_input: { command: "ls" } }).out;
  assert.match(reason, /solo lectura/);
  // regression: other agents keep their results
  assert.equal(relay("Bash", { command: "ls" }, "developer"), 0);
  assert.equal(relay("Bash", { command: "ls" }, "orchestrator"), 0);
  assert.equal(relay("Bash", { command: "ls" }, undefined), 0);
  assert.equal(relay("Agent", { subagent_type: "developer", prompt: "x" }, undefined), 0);
});

// governance-sdd-reliability, Fase A: fases de varias palabras, firma legada y gobierno por fase.

const statementOf = (p, name = "g") =>
  spawnSync("node", [HOOK, "statement", `docs/specs/${name}.md`], { input: "{}", env: p.env, encoding: "utf8" }).stdout;
const approveUnsigned = (p, name = "g") =>
  p.run("record", { prompt: `apruebo docs/specs/${name}.md`, unsigned: true, session_id: SESSION });
const signText = (p, text, name = "g") => writeFileSync(join(p.dir, `docs/specs/${name}.md.sig`), sign(KEY, text));
// What was signed before the full phase existed: first token of "Fase 1".
const legacyOf = (text) => text.replace(/\nFase 1\n$/, "\nFase\n");
const withLine = (text, index, value) => text.split("\n").map((line, i) => (i === index ? value : line)).join("\n");
const hmac = (p, fields) =>
  createHmac("sha256", readFileSync(join(p.dir, "key"), "utf8").trim()).update(fields.join("\n")).digest("hex");
const lastEntry = (file) => JSON.parse(readFileSync(file, "utf8").trim().split("\n").at(-1));
// Rewrites the last ledger entry as an old approval would have stored it ("Fase"), with a valid HMAC.
function legacyLedger(p) {
  const e = { ...lastEntry(p.ledger), phase: "Fase" };
  e.sig = hmac(p, ["functional", resolve(p.dir), e.spec, e.hash, e.phase, e.approver, e.date]);
  writeFileSync(p.ledger, `${JSON.stringify(e)}\n`);
}

test("phases with spaces: statement and ledger keep the full value and the message names the id (AC-01, AC-06)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1" });
  governed(p, "b", { phase: "B" });
  const lines = statementOf(p).split("\n");
  assert.equal(lines[4], "Fase 1");
  assert.equal(lines.length, 6, "header, root, spec, hash, phase and the final newline");
  assert.equal(statementOf(p, "b").split("\n")[4], "B");

  const r = approve(p);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /indica "Fase: 1" en el prompt/);
  assert.equal(lastEntry(p.ledger).phase, "Fase 1");
});

test("phases: an empty or missing Fase actual requires no declaration (AC-05)", () => {
  const p = project();
  governed(p, "e", { phase: "" });
  p.spec("n");
  assert.equal(statementOf(p, "e").split("\n")[4], "");
  assert.doesNotMatch(approve(p, "e").out, /indica "Fase:/);
  assert.equal(p.say("apruebo docs/specs/n.md").code, 0);
  assert.equal(launch(p, "developer", "docs/specs/e.md").code, 0, "empty value");
  assert.equal(launch(p, "developer", "docs/specs/n.md").code, 0, "no line");
});

const PHASES = [
  ["Fase 1", ["Fase: 1", "Fase: Fase 1", "fase: fase 1", "Fase:1", "Fase: 1.", "`Fase: 1`", "**Fase: Fase 1**", '"Fase: 1"', "Fase: 1, otra"], ["Fase 1", "Fase: Fase", "Fase: 10", "Fase: 11", "Fase: 1.1", "Fase: 2", "Fase: Fase 10", "Fase: Fase 1.1", "Fase: 1-2"]],
  ["Fase 10", ["Fase: 10", "Fase: Fase 10"], ["Fase: 1", "Fase: Fase 1", "Fase: 100"]],
  ["1", ["Fase: 1", "Fase: Fase 1"], ["Fase: 10", "Fase: 1.1"]],
  ["1.1", ["Fase: 1.1", "Fase: Fase 1.1"], ["Fase: 1", "Fase: 1.1.1", "Fase: 1x1", "Fase: Fase"]],
  ["B", ["Fase: B", "Fase: Fase B", "Fase: B."], ["Fase: B.1", "Fase: Fase B.1", "Fase: C"]],
  ["B.1", ["Fase: B.1", "Fase: B.1.", "`Fase: B.1`"], ["Fase: B", "Fase: B1", "Fase: B.10"]],
  ["Fase B", ["Fase: B", "Fase: Fase B"], ["Fase: B.1", "Fase: Fase"]],
];

test("gate: the declaration matches the exact phase id with a boundary (AC-02, AC-03, AC-04)", () => {
  const p = project();
  for (const [phase, ok, no] of PHASES) {
    governed(p, "g", { phase });
    assert.equal(approve(p).code, 0, phase);
    for (const d of ok) assert.equal(launch(p, "developer", `docs/specs/g.md ${d}`).code, 0, `${phase} accepts ${d}`);
    for (const d of no) assert.equal(launch(p, "developer", `docs/specs/g.md ${d}`).code, 2, `${phase} rejects ${d}`);
    assert.equal(launch(p, "developer", "docs/specs/g.md").code, 2, `${phase} needs a declaration`);
  }
  governed(p, "g", { phase: "Fase 1" });
  approve(p);
  assert.match(launch(p, "developer", "docs/specs/g.md").out, /debe declarar "Fase: 1"/);
});

test("phases: several specs in one prompt each need their own declaration (AC-04)", () => {
  const p = project();
  governed(p, "a", { phase: "Fase 1" });
  governed(p, "b", { phase: "Fase 10" });
  approve(p, "a");
  approve(p, "b");
  assert.equal(launch(p, "developer", "docs/specs/a.md Fase: 1, docs/specs/b.md Fase: Fase 10").code, 0);
  assert.equal(launch(p, "developer", "docs/specs/a.md docs/specs/b.md Fase: 10").code, 2, "a is not covered by 10");
  assert.equal(launch(p, "developer", "docs/specs/a.md docs/specs/b.md Fase: 1").code, 2, "b is not covered by 1");
});

test("legacy signature: a Fase 1 spec signed with the first token keeps working for that exact content (AC-07)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approveUnsigned(p);
  const text = statementOf(p);
  assert.match(text, /\nFase 1\n$/);
  assert.notEqual(legacyOf(text), text);

  signText(p, legacyOf(text));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 0, "legacy signature, no re-signing");
  assert.equal(write(p, "proxy.ts").code, 0, "sensitive file listed");
  assert.equal(write(p, "CLAUDE.md").code, 2, "functional approval still does not authorize governance");

  legacyLedger(p);
  assert.equal(lastEntry(p.ledger).phase, "Fase");
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 0, "ledger entry stored with Fase");
  assert.equal(write(p, "proxy.ts").code, 0);
});

test("legacy signature: any other statement fails (AC-08)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"] });
  approveUnsigned(p);
  const text = statementOf(p);
  const fails = (label, signed) => {
    signText(p, signed);
    assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 2, `${label}: gate`);
    assert.equal(write(p, "proxy.ts").code, 2, `${label}: sensitive`);
  };

  signText(p, legacyOf(text));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 0, "control: the legacy statement is valid");
  fails("other spec", legacyOf(text).replace("docs/specs/g.md", "docs/specs/other.md"));
  fails("other root", withLine(legacyOf(text), 1, `${text.split("\n")[1]}x`));
  fails("other hash", withLine(legacyOf(text), 3, "0".repeat(64)));
  for (const phase of ["Fase 2", "1", "Fase 10", "fase", "Fase 1 ", ""]) {
    fails(`phase "${phase}"`, withLine(text, 4, phase));
  }

  // Legacy signature of the content before an edit.
  signText(p, legacyOf(text));
  p.write("g", p.file("g") + "- requisito nuevo\n");
  approveUnsigned(p);
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 2, "content changed after signing");
  assert.equal(write(p, "proxy.ts").code, 2);

  // Legacy signature after the phase changes.
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"] });
  approveUnsigned(p);
  signText(p, legacyOf(statementOf(p)));
  p.write("g", p.file("g").replace("Fase actual: Fase 1", "Fase actual: Fase 2"));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 2").code, 2, "Fase actual changed after signing");
  assert.equal(write(p, "proxy.ts").code, 2);
});

test("governance: a Fase 1 authorization stores the full phase; old entries with Fase and their .gov.sig still validate (AC-09)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", governance: ["CLAUDE.md"] });
  approve(p);
  const file = join(p.dir, "privileged.jsonl");
  const govSig = join(p.dir, "docs/specs/g.md.gov.sig");
  const requestText = () =>
    spawnSync("node", [HOOK, "statement", "docs/specs/g.md", "gobierno", SESSION], { input: "{}", env: p.env, encoding: "utf8" }).stdout;

  const unsigned = p.run("record", { prompt: "autorizo gobierno docs/specs/g.md", session_id: SESSION, unsigned: true });
  assert.equal(unsigned.code, 0, unsigned.out);
  assert.equal(lastEntry(file).phase, "Fase 1");
  assert.match(unsigned.out, /fase "Fase 1"/);
  assert.match(requestText(), /\nfase: Fase 1\n/);
  assert.equal(write(p, "CLAUDE.md").code, 2, "unsigned request unlocks nothing");

  writeFileSync(govSig, sign(KEY, requestText()));
  assert.equal(write(p, "CLAUDE.md").code, 0, "signed request");

  // The same request as an old hook stored it.
  const e = { ...lastEntry(file), phase: "Fase" };
  e.sig = hmac(p, ["privileged", resolve(p.dir), e.spec, e.hash, e.phase, String(e.paths), e.operation, e.session, e.expires, e.approver, e.date]);
  writeFileSync(file, `${JSON.stringify(e)}\n`);
  assert.match(requestText(), /\nfase: Fase\n/);
  writeFileSync(govSig, sign(KEY, requestText().replace("fase: Fase\n", "fase: Fase 1\n")));
  assert.equal(write(p, "CLAUDE.md").code, 2, "a .gov.sig for another phase value");
  writeFileSync(govSig, sign(KEY, requestText()));
  assert.equal(write(p, "CLAUDE.md").code, 0, "old entry with its own .gov.sig");
});

test("external confirmation: Fase 1 without a valid signature unlocks nothing, and signatures do not cross types (AC-10)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approveUnsigned(p);
  const sig = join(p.dir, "docs/specs/g.md.sig");
  const govSig = join(p.dir, "docs/specs/g.md.gov.sig");
  const codes = () => [launch(p, "developer", "docs/specs/g.md Fase: 1").code, write(p, "proxy.ts").code, write(p, "CLAUDE.md").code, authorize(p).code];

  assert.deepEqual(codes(), [2, 2, 2, 2], "no .sig");
  writeFileSync(sig, "not a signature");
  assert.deepEqual(codes(), [2, 2, 2, 2], "invalid .sig");

  signText(p, statementOf(p));
  assert.deepEqual(codes().slice(0, 3), [0, 0, 2], "apruebo does not authorize governance");
  assert.equal(authorize(p).code, 0);
  assert.equal(write(p, "CLAUDE.md").code, 0, "apruebo plus autorizo gobierno, both signed");

  const functional = readFileSync(sig);
  writeFileSync(sig, readFileSync(govSig));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 2, "a .gov.sig is not a functional signature");
  assert.equal(write(p, "proxy.ts").code, 2);
  writeFileSync(sig, functional);
  writeFileSync(govSig, functional);
  assert.equal(write(p, "CLAUDE.md").code, 2, "a functional signature is not a .gov.sig");
});

test("never and Modo: build: ledgers and key stay out of reach, build opens nothing (AC-11)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  assert.equal(write(p, "CLAUDE.md").code, 0, "control: authorized");
  for (const rel of ["docs/specs/approvals.jsonl", "spec-privileged.jsonl", "spec-approval.key"]) {
    assert.equal(write(p, rel).code, 2, `${rel} blocked even with approval and authorization`);
  }

  const q = project();
  assert.equal(launch(q, "developer", "Modo: build. Edita proxy.ts y CLAUDE.md").code, 0);
  assert.equal(write(q, "proxy.ts").code, 2, "build does not open sensitive paths");
  assert.equal(write(q, "CLAUDE.md").code, 2, "build does not open governance");

  const r = project();
  governed(r, "g", { phase: "Fase 1", sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approve(r);
  assert.equal(launch(r, "developer", "Modo: build docs/specs/g.md Fase: 1").code, 0);
  assert.equal(write(r, "CLAUDE.md").code, 2, "approved spec plus build: governance still needs its authorization");
});

test("hash: content or Fase actual changes end the approval and the authorization; an approval does not cross checkouts (AC-11)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"], governance: ["CLAUDE.md"] });
  approve(p);
  authorize(p);
  const original = p.file("g");
  assert.equal(write(p, "proxy.ts").code, 0);
  assert.equal(write(p, "CLAUDE.md").code, 0);

  p.write("g", original.replace("Fase actual: Fase 1", "Fase actual: Fase 2"));
  const r = launch(p, "developer", "docs/specs/g.md Fase: 2");
  assert.equal(r.code, 2);
  assert.match(r.out, /cambió después de su aprobación/);
  assert.equal(write(p, "proxy.ts").code, 2, "phase changed");
  assert.equal(write(p, "CLAUDE.md").code, 2, "phase changed");

  // The signed approval, ledger and key copied to another checkout.
  p.write("g", original);
  const other = project();
  other.write("g", original);
  copyFileSync(join(p.dir, "docs/specs/g.md.sig"), join(other.dir, "docs/specs/g.md.sig"));
  writeFileSync(other.ledger, readFileSync(p.ledger, "utf8"));
  writeFileSync(join(other.dir, "key"), readFileSync(join(p.dir, "key"), "utf8"));
  assert.equal(launch(p, "developer", "docs/specs/g.md Fase: 1").code, 0, "control: original checkout");
  assert.equal(launch(other, "developer", "docs/specs/g.md Fase: 1").code, 2, "other checkout");
  assert.equal(write(other, "proxy.ts").code, 2, "other checkout");
});

test("gate with Modo: build: characterizes the current behavior for a spec cited by path or by slug (AC-12)", () => {
  const p = project();
  governed(p, "g", { phase: "Fase 1", sensitive: ["proxy.ts"] });

  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md").code, 2, "cited by path, draft");
  assert.equal(launch(p, "developer", "Modo: build docs/specs/nope.md").code, 2, "cited by path, missing");
  approveUnsigned(p);
  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md Fase: 1").code, 2, "cited by path, no signature");

  signText(p, statementOf(p));
  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md").code, 2, "valid, phase not declared");
  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md Fase: 10").code, 2, "valid, other phase");
  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md Fase: 1").code, 0, "valid, phase declared");

  p.write("g", p.file("g") + "- cambio\n");
  assert.equal(launch(p, "developer", "Modo: build docs/specs/g.md Fase: 1").code, 2, "cited by path, changed");

  // Cited by slug (no docs/specs route): nothing is validated, whatever the spec state.
  assert.equal(launch(p, "developer", "Modo: build. Evidencia UAT: spec g").code, 0, "by slug, changed spec");
  assert.equal(launch(p, "developer", "Modo: build. Evidencia UAT: g.md").code, 0, "by file name");
  assert.equal(launch(p, "developer", "Modo: build. Evidencia UAT: spec nope").code, 0, "by slug, unknown spec");
  assert.equal(launch(p, "developer", "Evidencia UAT: spec g").code, 2, "a slug alone is not a spec route nor Modo: build");
  assert.equal(write(p, "proxy.ts").code, 2, "citing by slug authorizes nothing");
});

test("sections: '## Gobierno afectado por fase' does not authorize paths (AC-14)", () => {
  const p = project();
  p.write(
    "g",
    "# g\n\n- Estado: borrador\n- Fase actual: A\n\n" +
      "## Cambios de gobierno\n\nSolo los de la fase actual.\n\n- `CLAUDE.md`\n\n" +
      "## Gobierno afectado por fase\n\n| Fase | Archivo | Cambio |\n|---|---|---|\n| A | `CLAUDE.md` | uno |\n| B | `docs/SETUP.md` | dos |\n| B | `AGENTS.md` | tres |\n\n- `.mcp.json`\n\n" +
      "## Plan de tareas\n\n### Fase A\n- [ ] T1\n\n### Fase B\n- [ ] T2\n",
  );
  approve(p);
  const r = authorize(p);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(lastEntry(join(p.dir, "privileged.jsonl")).paths, ["CLAUDE.md"], "only the listed section is read");
  assert.doesNotMatch(r.out, /SETUP|AGENTS|mcp/);
  assert.equal(write(p, "CLAUDE.md").code, 0, "listed in Cambios de gobierno");
  for (const rel of ["docs/SETUP.md", "AGENTS.md", ".mcp.json"]) {
    assert.equal(write(p, rel).code, 2, `${rel} is only mentioned under Gobierno afectado por fase`);
  }
});

// RN-08: planOpen only looks at the "### Fase <id>" subsection of the current phase.

const phased = (p, current, plan, name = "g") =>
  p.write(
    name,
    `# ${name}\n\n- Estado: borrador\n- Fase actual: ${current}\n\n## Archivos sensibles\n- \`proxy.ts\`\n\n` +
      `## Cambios de gobierno\n- \`CLAUDE.md\`\n\n## Plan\n${plan}`,
  );

test("plan by phase: a closed phase does not reuse permissions (AC-B4)", () => {
  const p = project();
  phased(p, "A", "### Fase A\n- [x] T1\n\n### Fase B\n- [ ] T2\n");
  assert.equal(approve(p).code, 0);
  assert.equal(write(p, "proxy.ts").code, 2, "sensitive path of the closed phase A");
  const r = authorize(p);
  assert.equal(r.code, 2, "governance request rejected");
  assert.match(r.out, /plan terminado/);
  assert.equal(write(p, "CLAUDE.md").code, 2, "governance path of the closed phase A");
});

test("plan by phase: open in the current phase authorizes; closed current phase does not (AC-B5)", () => {
  const p = project();
  phased(p, "A", "### Fase A\n- [ ] T1\n\n### Fase B\n- [x] T2\n");
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 0, "open task in the current phase");
  assert.equal(authorize(p).code, 0, "governance authorized");
  assert.equal(write(p, "CLAUDE.md").code, 0);

  const q = project();
  phased(q, "B", "### Fase A\n- [ ] T1\n\n### Fase B\n- [x] T2\n");
  approve(q);
  assert.equal(write(q, "proxy.ts").code, 2, "open only in another phase");
  assert.equal(authorize(q).code, 2);
});

test("plan by phase: unticking a box stays blocked, also with subsections (AC-B6)", () => {
  const p = project();
  phased(p, "B", "### Fase A\n- [ ] T1\n\n### Fase B\n- [x] T2\n");
  approve(p);
  const edit = (old_string, new_string) =>
    p.run("guard", { tool_input: { file_path: join(p.dir, "docs/specs/g.md"), old_string, new_string } }).code;
  assert.equal(write(p, "proxy.ts").code, 2, "finished phase B");
  assert.equal(edit("- [x] T2", "- [ ] T2"), 2, "unticking by edit");
  assert.equal(write(p, "proxy.ts").code, 2, "still blocked");
});

test("plan by phase: current phase without a matching subsection authorizes nothing (AC-B7)", () => {
  const p = project();
  phased(p, "C", "### Fase A\n- [ ] T1\n\n### Fase B\n- [ ] T2\n");
  approve(p);
  assert.equal(write(p, "proxy.ts").code, 2, "C with only A and B");
  const r = authorize(p);
  assert.equal(r.code, 2);
  assert.match(r.out, /no tiene subsección "### Fase C"/);

  const q = project();
  phased(q, "1", "### Fase 10\n- [ ] T1\n");
  approve(q);
  assert.equal(write(q, "proxy.ts").code, 2, "1 is not Fase 10");
  assert.match(authorize(q).out, /no tiene subsección "### Fase 1"/);

  const s = project();
  phased(s, "B", "- [ ] T1\n- [ ] T2\n");
  approve(s);
  assert.equal(write(s, "proxy.ts").code, 0, "no subsections: whole section counts");
  assert.equal(authorize(s).code, 0);
});

// governance-product-uat-commands, Fase 1 (T1): product C1 allowlist (Bash) and secrets mode (Read/Glob/Grep/@).

const TARGETS = "127.0.0.1:3001";
const productBash = (p, command, targets = TARGETS) => {
  if (targets === null) delete p.env.PRODUCT_UAT_HTTP_TARGETS;
  else p.env.PRODUCT_UAT_HTTP_TARGETS = targets;
  return p.run("relay", { agent_type: "product", tool_name: "Bash", tool_input: { command } });
};
const secretsOf = (p, agent_type, tool_name, tool_input) =>
  p.run("secrets", { agent_type, hook_event_name: "PreToolUse", tool_name, tool_input });
const mentionOf = (p, agent_type, prompt) => p.run("secrets", { agent_type, hook_event_name: "UserPromptSubmit", prompt });

test("product Bash: every C1 command is allowed (AC-C01, AC-C11, positives of AC-C03/C04)", () => {
  const p = project();
  const allowed = [
    "git log -n 5", "git log --oneline HEAD", "git log HEAD^", "git log --stat --name-only --name-status -- src",
    "git log -p --no-ext-diff --no-textconv HEAD", "git show --no-ext-diff --no-textconv HEAD",
    "git show --stat --name-only --no-ext-diff --no-textconv HEAD~1", "git show --no-ext-diff --no-textconv HEAD:README.md",
    "git diff --no-ext-diff --no-textconv", "git diff --no-ext-diff --no-textconv HEAD~3..HEAD",
    "git diff --stat --name-only --name-status --no-ext-diff --no-textconv HEAD -- src",
    "git status", "git status --short", "git status -s", "git status --porcelain", "git ls-files -- src",
    "git rev-parse HEAD", "git rev-parse --short HEAD", "git rev-parse --abbrev-ref HEAD", "git rev-parse --show-toplevel",
    "git branch --list", "git branch --show-current", "git blame -- README.md", "git blame -L 1,5 HEAD -- README.md",
    "git grep -e foo -- src", "git grep -n -i -w -l -c -e foo -- src", "git grep -n -e 'foo bar' -- src",
    "node --version", "npm --version",
    "curl -q --noproxy 127.0.0.1 -s http://127.0.0.1:3001/api/x",
    "curl -q --noproxy 127.0.0.1 -s -S -i -I --max-time 5 -H 'Accept: application/json' http://127.0.0.1:3001/api/x",
    "curl -q --noproxy 127.0.0.1 -s 'http://127.0.0.1:3001/api/x?a=1&b=2'",
  ];
  for (const command of allowed) assert.equal(productBash(p, command).code, 0, command);
});

test("product Bash: git mutating commands are C4 (AC-C02)", () => {
  const p = project();
  const mutating = ["commit", "push", "checkout", "switch", "reset", "restore", "stash", "merge", "rebase", "cherry-pick", "apply", "am", "clean", "tag", "config", "worktree", "remote", "fetch", "pull"];
  for (const sub of mutating) {
    const r = productBash(p, `git ${sub}`);
    assert.equal(r.code, 2, sub);
    assert.match(r.out, /prohibido para todos/, sub);
  }
  assert.equal(productBash(p, "git branch -D x").code, 2);
});

test("product Bash: positive grammar rejects chaining, expansion, redirection and odd tokens (AC-C03)", () => {
  const p = project();
  const bad = [
    "git log; git status", "git log && git status", "git log | cat", "git log $(echo HEAD)", "git log `echo HEAD`",
    "git log > x", "git log < x", "VAR=x git log", "git log\ngit status", "git log\r", "git log \\\nHEAD",
    "git log *", "git log ?", "git log [a]", "git log {a,b}", "git log $GITHUB_TOKEN", "git log ${GITHUB_TOKEN}",
    'git log "$GITHUB_TOKEN"', "git log $'\\x2e'env", "git log ~/.ssh", "git log -- !!", "git log # x", "git log\t-n 5",
    "git  log", " git log", "git log ", "git log && && git status", "git log --oneline HEAD~3..HEAD", "", "git log -n 5 &",
    "git log 'a'b", 'git log "HEAD"', "git log 'HEAD",
  ];
  for (const command of bad) assert.equal(productBash(p, command).code, 2, JSON.stringify(command));
  assert.doesNotMatch(productBash(p, "git log $GITHUB_TOKEN").out, /GITHUB_TOKEN/, "value never printed");
  assert.doesNotMatch(productBash(p, "git log ${GITHUB_TOKEN}").out, /GITHUB_TOKEN/, "value never printed");
});

test("product Bash: git allowlist is per subcommand with exact tokens (AC-C04)", () => {
  const p = project();
  const bad = [
    "git -C . log", "git -c core.pager=x log", "git --git-dir=x log", "git --work-tree=x log", "git log --output=x", "git log -o x",
    "git diff --ext-diff", "git diff", "git diff --no-ext-diff", "git diff --no-textconv", "git show HEAD", "git show --no-ext-diff HEAD",
    "git log -p", "git log -p --no-ext-diff HEAD", "git grep -Oless foo -- src", "git grep --open-files-in-pager=less foo -- src",
    "git grep -nO foo -- src", "git grep -f .env -- src", "git grep --untracked foo -- .", "git grep -e foo", "git grep -n foo -- src",
    "git diff --no-index a b", "git diff --no-ind a b", "git blame --contents .env README.md", "git blame -S x -- README.md",
    "git blame README.md", "git status --ignored", "git branch -a", "git log --oneline=3", "git log -n5", "git log -n x",
    "git show --no-ext-diff --no-textconv HEAD:.env", "git log -- :(top)src", "git log HEAD@{1}", "git log -- ../x", "git log -- /etc/passwd",
    "git diff --no-ext-diff --no-textconv HEAD...main",
  ];
  for (const command of bad) assert.equal(productBash(p, command).code, 2, command);
  assert.match(productBash(p, "git show --no-ext-diff --no-textconv HEAD:.env").out, /secretos/, "secret rule, not missing flags");
});

test("product Bash: Object.prototype keys never resolve in the allowlists (RN-C07)", () => {
  const p = project();
  const keys = ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"];
  const bad = keys.flatMap((k) => [
    `git ${k}`, `git log ${k} --output=x`, `git log HEAD ${k} -p`, `git log ${k} x`, `git grep -e a ${k} -Ocmd -- src`,
    `git log ${k} 5`, `git grep ${k} -e a -- src`, `git blame ${k} x -- README.md`, `git diff --no-ext-diff --no-textconv ${k} ${k}`,
  ]);
  for (const command of bad) {
    const r = productBash(p, command);
    assert.equal(r.code, 2, command);
    assert.doesNotMatch(r.out, /TypeError|ReferenceError|\bat \S+ \(/, `no exception: ${command}`);
  }
  assert.equal(productBash(p, "git log -n 5 constructor").code, 0, "plain rev named like a key is still just a rev");
});

test("product Bash: curl gate (AC-C05)", () => {
  const p = project();
  const ok = "curl -q --noproxy 127.0.0.1 -s http://127.0.0.1:3001/api/x";
  assert.equal(productBash(p, ok).code, 0);
  assert.equal(productBash(p, ok, null).code, 2, "no PRODUCT_UAT_HTTP_TARGETS");
  assert.equal(productBash(p, ok, "127.0.0.1:3002").code, 2, "host:port outside the list");
  const base = "curl -q --noproxy 127.0.0.1";
  const url = "http://127.0.0.1:3001/";
  const bad = [
    `${base} -s -L ${url}`, `${base} --location ${url}`, `${base} --next ${url}`, `${base} -: ${url}`, `${base} --url ${url}`,
    `${base} ${url} ${url}b`, `${base} --resolve a:1:127.0.0.1 ${url}`, `${base} --connect-to a:1:b:2 ${url}`,
    `${base} -x http://p:1 ${url}`, `${base} --proxy http://p:1 ${url}`, `${base} --unix-socket /x ${url}`,
    `${base} http://127.0.0.1:3001/[1-3]`, `${base} 'http://127.0.0.1:3001/{a,b}'`, `${base} http://user:pw@127.0.0.1:3001/`,
    `${base} -H 'Authorization: Bearer x' ${url}`, `${base} -H 'Cookie: a=b' ${url}`, `${base} -X POST ${url}`, `${base} -d a=b ${url}`,
    `${base} --data-raw a ${url}`, `${base} -F a=b ${url}`, `${base} -T x ${url}`, `${base} -o x ${url}`, `${base} -O ${url}`,
    `${base} -K x ${url}`, `${base} -b x ${url}`, `${base} -c x ${url}`, `${base} -u a:b ${url}`,
    "curl -q --noproxy 10.0.0.1 http://10.0.0.1:3001/", `${base} https://127.0.0.1:3001/`, `${base} file:///x/.env`,
    `curl --noproxy 127.0.0.1 ${url}`, `curl -s -q --noproxy 127.0.0.1 ${url}`, `curl -q -s ${url}`, `curl -q --noproxy localhost -s ${url}`,
    `${base} --noproxy 127.0.0.1 -s ${url}`, `${base} -s http://127.0.0.1/`, `${base} -s http://127.0.0.1:3001/$TOKEN`,
    `${base} -s "http://127.0.0.1:3001/$TOKEN"`, `${base} -s http://127.0.0.1:3001/\${TOKEN}`, `${base} -s`,
  ];
  for (const command of bad) assert.equal(productBash(p, command).code, 2, command);
  assert.doesNotMatch(productBash(p, `${base} -s http://127.0.0.1:3001/$TOKEN`).out, /TOKEN/);
  // a non-loopback host is refused even if the variable lists it
  assert.equal(productBash(p, "curl -q --noproxy 10.0.0.1 -s http://10.0.0.1:3001/", "10.0.0.1:3001").code, 2);
});

test("product Bash: secrets through Bash are blocked (AC-C06)", () => {
  const p = project();
  const flags = "--no-ext-diff --no-textconv";
  const bad = [
    `git show ${flags} HEAD:.env`, `git show ${flags} HEAD:config/.env.production`, `git show ${flags} HEAD:.e{nv,}`,
    `git show ${flags} HEAD:.en?`, `git show ${flags} HEAD:.en[v]`, `git show ${flags} HEAD:.e\\nv`, `git show ${flags} HEAD:'.e'nv`,
    `git show ${flags} $'\\x2e'env`, "git grep -e foo -- .env", "git grep -e foo -- .env.local", `git diff ${flags} -- .env`,
    "git log -- id_rsa", "git log -- server.pem", "git log -- .git/config", "git log -- .ssh/id_rsa", "git log -- .npmrc",
    "git log -- .mcp.json", "git log -- .claude/settings.local.json", "git log -- credentials.json", `git diff ${flags} id_rsa`,
    "curl -q --noproxy 127.0.0.1 file:///c/x/.env", "env", "printenv", "cat .env", "set", "export X=1",
  ];
  for (const command of bad) assert.equal(productBash(p, command).code, 2, command);
  assert.equal(productBash(p, "git log -- .env.example").code, 0, ".env.example is not secret");
  assert.match(productBash(p, `git show ${flags} HEAD:.env`).out, /secretos/);
});

test("product Bash: everything else outside C1 is blocked (AC-C07, AC-C08)", () => {
  const p = project();
  const bad = [
    "npm install", "npm ci", "npm run dev", "npm exec x", "npx vitest run", "npx playwright test", "pnpm install", "yarn run x", "node -e 1", "node -p 1",
    "node script.js", "python x.py", "sh x", "bash -c x", "powershell x", "cmd x", "rm x", "mv a b", "cp a b", "touch x", "mkdir x", "chmod +x x",
    "gh pr list", "linear x", "vercel deploy", "clerk x", "claude", "ls", "cat README.md", "echo hi", "git", "npm --version x", "node --version --x",
  ];
  for (const command of bad) assert.equal(productBash(p, command).code, 2, command);
  for (const command of ["npx vitest run", "npx playwright test", "curl -q --noproxy 127.0.0.1 -X POST http://127.0.0.1:3001/x"]) {
    assert.match(productBash(p, command).out, /Producto.*ASISTIDA.*product solo propone el comando/, command);
  }
  for (const command of ["npm run dev", "vercel deploy", "git push", "rm x"]) assert.match(productBash(p, command).out, /prohibido para todos/, command);
});

test("product: non-Bash tools stay blocked; other agents keep their relay results (AC-C09, AC-C10)", () => {
  const p = project();
  for (const tool_name of ["PowerShell", "mcp__terminal__run", "Agent", "SendMessage", "CronCreate", "RemoteTrigger", "mcp__scheduled-tasks__create"]) {
    assert.equal(p.run("relay", { agent_type: "product", tool_name, tool_input: { command: "git status" } }).code, 2, tool_name);
  }
  for (const agent_type of ["developer", "orchestrator", undefined]) {
    assert.equal(p.run("relay", { agent_type, tool_name: "Bash", tool_input: { command: "ls" } }).code, 0, String(agent_type));
  }
  const src = readFileSync(HOOK, "utf8");
  assert.match(src, /new Set\(\["spec", "reviewer", "Explore", "Plan"\]\)/, "IMPLEMENTS_NOTHING unchanged");
});

test("settings.json: only the two secrets entries were added (AC-C10)", () => {
  const settings = JSON.parse(readFileSync(join(import.meta.dirname, "..", "settings.json"), "utf8"));
  const secretsHooks = (entries) => entries.filter((e) => e.hooks.some((h) => / secrets$/.test(h.command)));
  const pre = secretsHooks(settings.hooks.PreToolUse);
  assert.equal(pre.length, 1);
  assert.equal(pre[0].matcher, "Read|Glob|Grep");
  assert.equal(pre[0].hooks[0].onFailure, "block");
  const prompt = secretsHooks(settings.hooks.UserPromptSubmit);
  assert.equal(prompt.length, 1);
  assert.equal(prompt[0].hooks[0].onFailure, "block");
  assert.equal(settings.hooks.UserPromptSubmit.length, 2);
  assert.ok(settings.hooks.UserPromptSubmit.some((e) => e.hooks.some((h) => / record$/.test(h.command))), "record entry kept");
  assert.equal(settings.hooks.PreToolUse.length, 4);
  assert.ok(![...settings.permissions.deny, ...settings.permissions.ask].some((rule) => /\.env/.test(rule)), "no global .env permission rules");
});

function secretsProject() {
  const p = project();
  mkdirSync(join(p.dir, "src"), { recursive: true });
  mkdirSync(join(p.dir, "config"), { recursive: true });
  for (const f of [".env", ".env.local", ".env.example", "config/.env.production", "id_rsa", "server.pem", "src/page.tsx", "README.md", ".mcp.json"]) {
    writeFileSync(join(p.dir, f), "x");
  }
  return p;
}

test("secrets mode: Read is confined to the repository and blocks secret paths (AC-C15)", () => {
  const p = secretsProject();
  const read = (file_path) => secretsOf(p, "product", "Read", { file_path }).code;
  const home = homedir();
  const blocked = [
    ".env", ".env.local", "config/.env.production", ".ENV.LOCAL", "./src/../.env", join(p.dir, ".env"), "id_rsa", "server.pem", ".git/config",
    "~/.claude/spec-approval.key", "~/.claude/.credentials.json", "~/.claude.json", "~/.git-credentials", "~/.aws/credentials",
    "~/.config/gh/hosts.yml", join(home, ".aws", "credentials"), "../outside.txt", ".mcp.json", ".claude/settings.local.json",
    ".env::$DATA", ".env.", ".env ", ".ENV", "src/../../outside.txt", join(p.dir, "..", "outside.txt"),
  ];
  if (process.platform === "win32") {
    blocked.push(`/${home[0].toLowerCase()}/${home.slice(3).replace(/\\/g, "/")}/.aws/credentials`, `\\\\?\\${join(home, ".aws", "credentials")}`);
  }
  for (const file_path of blocked) assert.equal(read(file_path), 2, file_path);
  for (const file_path of [".env.example", "src/page.tsx", "README.md", join(p.dir, "src/page.tsx")]) assert.equal(read(file_path), 0, file_path);
  assert.equal(secretsOf(p, "product", "Read", {}).code, 2, "missing path fails closed");
  // symlinks: to a secret inside the repo and to a file outside it
  const outside = join(tempDir("outside-"), "ext.txt");
  writeFileSync(outside, "ext");
  try {
    symlinkSync(join(p.dir, ".env.local"), join(p.dir, "notas.txt"));
    symlinkSync(outside, join(p.dir, "externo.txt"));
    assert.equal(read("notas.txt"), 2, "symlink to a secret");
    assert.equal(read("externo.txt"), 2, "symlink to a file outside the repo");
  } catch (e) {
    if (e.code !== "EPERM") throw e; // Windows sin privilegio de symlink: se cubre en sesión real (AC-C16).
  }
  const outDir = tempDir("outdir-");
  writeFileSync(join(outDir, "a.txt"), "x");
  try {
    symlinkSync(outDir, join(p.dir, "junction"), "junction");
    assert.equal(read("junction/a.txt"), 2, "junction outside the repo");
  } catch (e) {
    if (e.code !== "EPERM") throw e;
  }
  if (process.platform === "win32") {
    const short = execSync("for %I in (.env.local) do @echo %~sI", { cwd: p.dir, shell: "cmd.exe", encoding: "utf8" }).trim();
    if (short && short.toLowerCase() !== ".env.local") assert.equal(read(short), 2, `8.3 name ${short}`);
  }
});

test("secrets mode: Glob (AC-C15)", () => {
  const p = secretsProject();
  const glob = (tool_input) => secretsOf(p, "product", "Glob", tool_input).code;
  for (const pattern of ["**/.env*", "**/*.pem", "**/*", "*", ".env", "**/id_rsa*", ".ssh/**/*.ts", "**/credentials*.json", "../**/*.ts", "~/.ssh/**", "**/.mcp.json"]) {
    assert.equal(glob({ pattern }), 2, pattern);
  }
  assert.equal(glob({ pattern: "**/*.ts", path: join(p.dir, "..") }), 2, "root outside the repo");
  assert.equal(glob({ pattern: "**/*.ts", path: ".env" }), 2, "secret path");
  for (const tool_input of [{ pattern: "src/**/*.ts" }, { pattern: "**/*.tsx", path: "src" }, { pattern: "**/*.md" }, { pattern: "modules/**/*.ts", path: join(p.dir, "src") }]) {
    assert.equal(glob(tool_input), 0, JSON.stringify(tool_input));
  }
});

test("secrets mode: Grep needs a closed, bounded scope (AC-C15)", () => {
  const p = secretsProject();
  const grep = (tool_input) => secretsOf(p, "product", "Grep", { pattern: "UAT_FAKE_SECRET", ...tool_input }).code;
  const blocked = [
    {}, { path: "." }, { path: "src" }, { path: "src", glob: "*" }, { path: "src", glob: "**/*" }, { path: ".env", type: "ts" },
    { path: "src", glob: ".env" }, { path: "src", type: "json" }, { path: "src", glob: "*.json" }, { path: "src", type: "yaml" },
    { path: "src", type: "ts", glob: "*.json" }, { path: "src", glob: "*.{ts,json}" }, { path: "src", glob: "!*.ts" }, { path: "src", glob: "*.ts,*.json" },
    { path: "src", glob: "credentials*.json" }, { path: "src", glob: "**/credentials*.json" }, { path: "config/credentials.json", type: "ts" },
    { type: "ts" }, { path: join(p.dir, ".."), type: "ts" }, { path: "src", glob: "*.ts *.md" }, { path: "src", glob: "*.pem" }, { path: "src", type: "env" },
    { path: "src", type: "config" }, { path: "src", type: "ts", glob: "[a].ts" }, { path: "src", glob: "src/*.ts" },
    ...["files_with_matches", "count", "content"].map((output_mode) => ({ path: "src", output_mode })),
  ];
  for (const input of blocked) assert.equal(grep(input), 2, JSON.stringify(input));
  const ok = [
    { path: "src", type: "ts" }, { path: "modules", glob: "**/*.tsx" }, { path: "src", glob: "*.md" }, { path: "src", type: "js", glob: "*.mjs" },
    ...["ts", "js", "md", "css", "html"].map((type) => ({ path: "src", type })),
    ...["ts", "tsx", "js", "jsx", "mjs", "cjs", "md", "mdx", "css", "html"].flatMap((ext) => [{ path: "src", glob: `*.${ext}` }, { path: "src", glob: `**/*.${ext}` }]),
    ...["files_with_matches", "count", "content"].map((output_mode) => ({ path: "src", type: "ts", output_mode })),
  ];
  for (const input of ok) assert.equal(grep(input), 0, JSON.stringify(input));
});

test("secrets mode: @mentions in the prompt (AC-C15)", () => {
  const p = secretsProject();
  const mention = (prompt) => mentionOf(p, "product", prompt).code;
  for (const prompt of ["@.env.local", "mira @config/.env.production", "@./x/../.env", "@~/.ssh/id_rsa", "ver @id_rsa por favor", "@../outside.txt", '@".env.local"', "@.env.local, gracias"]) {
    assert.equal(mention(prompt), 2, prompt);
  }
  for (const prompt of ["@src/page.tsx", "@docs/", "hola", "escribe a a@b.com", "@src/page.tsx y @.env.example", "@src/page.tsx."]) assert.equal(mention(prompt), 0, prompt);
  assert.equal(p.run("secrets", { agent_type: "product", hook_event_name: "Stop" }).code, 2, "unknown event fails closed");
});

test("secrets mode: any other agent exits 0 untouched (AC-C10, AC-C15)", () => {
  const p = secretsProject();
  for (const agent_type of ["developer", "orchestrator", undefined]) {
    for (const [tool_name, tool_input] of [
      ["Read", { file_path: ".env" }], ["Read", { file_path: "docs/specs/x.md" }], ["Read", { file_path: ".env.example" }], ["Read", { file_path: "../outside.txt" }],
      ["Read", { file_path: "~/.aws/credentials" }], ["Glob", { pattern: "**/.env*" }], ["Grep", { pattern: "x" }], ["Grep", { pattern: "x", glob: "*.json" }],
    ]) {
      assert.equal(secretsOf(p, agent_type, tool_name, tool_input).code, 0, `${agent_type} ${tool_name} ${JSON.stringify(tool_input)}`);
    }
    assert.equal(mentionOf(p, agent_type, "@.env.local @~/.ssh/id_rsa").code, 0, `${agent_type} @`);
  }
  // record keeps working for approvals alongside the new mode
  p.spec("a");
  assert.equal(p.say("apruebo docs/specs/a.md").code, 0);
});

test("secrets mode: hardLinked ignores directories (nlink>=2) and fails closed on stat errors (AC-C15, RN-C08)", () => {
  const p = secretsProject();
  const pre = join(tempDir("hl-preload-"), "preload.mjs");
  writeFileSync(
    pre,
    `import fs, { statSync } from "node:fs";
const real = statSync;
fs.statSync = (path, ...rest) => {
  const name = String(path).replace(/[\\\\/]+$/, "").split(/[\\\\/]/).pop();
  if (process.env.HL_FAKE === "dir" && name === "src") return { isFile: () => false, nlink: 3 };
  if (process.env.HL_FAKE === "eacces" && name === "README.md") throw Object.assign(new Error("EACCES"), { code: "EACCES" });
  return real(path, ...rest);
};
process.getBuiltinModule("module").syncBuiltinESMExports();
`,
  );
  p.env.NODE_OPTIONS = `--import ${pathToFileURL(pre).href}`;
  const read = (file_path) => secretsOf(p, "product", "Read", { file_path }).code;
  assert.equal(read("README.md"), 0, "control without fake");
  p.env.HL_FAKE = "dir";
  assert.equal(read("src"), 0, "Read of a dir with nlink 3");
  assert.equal(mentionOf(p, "product", "mira @src/").code, 0, "@dir/ with nlink 3");
  p.env.HL_FAKE = "eacces";
  assert.equal(read("README.md"), 2, "EACCES fails closed");
});

test("secrets mode: hard links and oversized Grep scopes fail closed (AC-C15, RN-C08)", () => {
  const p = secretsProject();
  const hardlink = join(p.dir, "src", "dup.ts");
  linkSync(join(p.dir, ".env.local"), join(p.dir, "enlace.txt"));
  const outside = join(tempDir("hl-outside-"), "ext.txt");
  writeFileSync(outside, "ext");
  linkSync(outside, join(p.dir, "externo-hl.txt"));
  linkSync(join(p.dir, "src", "page.tsx"), hardlink);
  const run = (agent_type, tool_name, tool_input) => secretsOf(p, agent_type, tool_name, tool_input).code;
  assert.equal(run("product", "Read", { file_path: "enlace.txt" }), 2, "hard link to .env.local");
  assert.equal(run("product", "Read", { file_path: "externo-hl.txt" }), 2, "hard link to an external file");
  assert.equal(mentionOf(p, "product", "mira @enlace.txt").code, 2, "@hardlink");
  assert.equal(run("product", "Grep", { pattern: "x", path: "src", type: "ts" }), 2, "dir with a hard link");
  assert.equal(run("product", "Grep", { pattern: "x", path: "src/dup.ts", type: "ts" }), 2, "hard-linked file as path");
  for (const agent_type of ["developer", "orchestrator"]) {
    assert.equal(run(agent_type, "Read", { file_path: "enlace.txt" }), 0, agent_type);
    assert.equal(run(agent_type, "Grep", { pattern: "x", path: "src", type: "ts" }), 0, agent_type);
  }
  // limit: 5000 files pass, 5001 block; .git, node_modules and .next are skipped
  const big = join(p.dir, "big");
  mkdirSync(big);
  for (let i = 0; i < 5000; i++) writeFileSync(join(big, `f${i}.ts`), "");
  mkdirSync(join(big, "node_modules"));
  writeFileSync(join(big, "node_modules", "skipped.ts"), "");
  assert.equal(run("product", "Grep", { pattern: "x", path: "big", type: "ts" }), 0, "5000 files");
  writeFileSync(join(big, "extra.ts"), "");
  assert.equal(run("product", "Grep", { pattern: "x", path: "big", type: "ts" }), 2, "over 5000 files");
});

test("product Bash: git grep/diff/blame block hard links in their scope (L10, AC-C15)", () => {
  const p = secretsProject();
  writeFileSync(join(p.dir, "innocent.txt"), "SYNTH");
  linkSync(join(p.dir, "innocent.txt"), join(p.dir, "src", "dup.ts"));
  const bash = (command) => productBash(p, command).code;
  const nx = "--no-ext-diff --no-textconv";
  const blocked = [
    "git grep -n -e SYNTH -- innocent.txt", "git grep -n -e SYNTH -- .", "git grep -n -e SYNTH -- src",
    `git diff ${nx}`, `git diff ${nx} -- innocent.txt`, `git diff ${nx} -- .`, `git diff --stat ${nx}`, `git diff --name-only ${nx}`,
    `git diff HEAD ${nx}`, `git diff HEAD~1 ${nx}`, `git diff HEAD~1..HEAD ${nx}`,
    "git blame -- innocent.txt", "git blame HEAD -- innocent.txt", "git blame -L 1,2 HEAD~1 -- innocent.txt",
    `git diff --cached ${nx}`, `git diff --staged ${nx}`,
  ];
  for (const command of blocked) assert.equal(bash(command), 2, command);
  assert.match(productBash(p, "git grep -n -e SYNTH -- innocent.txt").out, /enlace duro/);
  // scope matters: a link under src/ does not block other paths; node_modules is skipped
  assert.equal(bash(`git diff ${nx} -- README.md`), 0);
  assert.equal(bash("git grep -n -e x -- config"), 0);
  assert.equal(bash("git blame -- README.md"), 0);
  // outside the vector or without file content: unchanged
  for (const command of ["git log -p --no-ext-diff --no-textconv", "git show --no-ext-diff --no-textconv HEAD:innocent.txt", "git status", "git ls-files", "git log -- innocent.txt"]) {
    assert.equal(bash(command), 0, command);
  }
  for (const agent_type of ["developer", "orchestrator"]) {
    assert.equal(p.run("relay", { agent_type, tool_name: "Bash", tool_input: { command: "git grep -n -e SYNTH -- ." } }).code, 0, agent_type);
  }
  // no hard links: diff of the whole repo passes
  const q = secretsProject();
  assert.equal(productBash(q, `git diff ${nx}`).code, 0);
  assert.equal(productBash(q, "git grep -n -e x -- .").code, 0);
  mkdirSync(join(q.dir, "node_modules"));
  writeFileSync(join(q.dir, "node_modules", "a.txt"), "x");
  linkSync(join(q.dir, "node_modules", "a.txt"), join(q.dir, "node_modules", "b.txt"));
  assert.equal(productBash(q, `git diff ${nx}`).code, 0, "node_modules skipped");
  // fail-closed: over 5000 files
  const big = join(q.dir, "big");
  mkdirSync(big);
  for (let i = 0; i < 5001; i++) writeFileSync(join(big, `f${i}.txt`), "");
  assert.equal(productBash(q, "git grep -n -e x -- big").code, 2, "5001 files");
  assert.equal(productBash(q, `git diff ${nx}`).code, 2, "5001 files, whole repo");
});

// AC-C21: el adaptador no contradice el contrato (card por paso, acciones tras CADA paso)
test("AC-C21: adaptador product.md alineado con el contrato de card por paso", () => {
  const root = join(import.meta.dirname, "../..");
  const adapter = readFileSync(join(root, ".claude/agents/product.md"), "utf8");
  const contract = readFileSync(join(root, "docs/uat/product-agent.md"), "utf8");
  assert.match(adapter, /por paso/);
  assert.doesNotMatch(adapter, /requiere terminal/);
  assert.doesNotMatch(adapter, /No avances hasta cerrar el caso/);
  assert.match(adapter, /incluida la primera/);
  assert.match(adapter, /mismo mensaje/);
  assert.match(adapter, /Paso n de m/);
  assert.match(adapter, /1 continuar/);
  assert.match(adapter, /2 repetir/);
  assert.match(adapter, /3 registrar/);
  assert.match(contract, /después de CADA paso/);
  assert.match(contract, /Paso n de m/);
  assert.match(contract, /1 continuar/);
  assert.match(contract, /2 repetir/);
  assert.match(contract, /3 registrar/);
});

// DEMO-ADJ-01: en PowerShell 5.1 la card no usa parámetros/operadores exclusivos de PowerShell 7
test("DEMO-ADJ-01: contrato prohíbe sintaxis PowerShell 7 en cards de PowerShell 5.1", () => {
  const root = join(import.meta.dirname, "../..");
  const contract = readFileSync(join(root, "docs/uat/product-agent.md"), "utf8");
  assert.match(contract, /PowerShell 5\.1[^\n]*-StatusCodeVariable/);
  for (const t of ["-SkipHttpErrorCheck", "-SkipCertificateCheck", "-ResponseHeadersVariable", "?:", "??"]) {
    assert.ok(contract.includes(t), `falta ${t}`);
  }
  assert.match(contract, /Invoke-WebRequest -UseBasicParsing[^\n]*\.StatusCode/);
});
