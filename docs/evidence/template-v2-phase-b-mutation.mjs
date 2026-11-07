// Prueba de mutación de Fase B: desactiva cada control del hook y comprueba que algún test falla.
// Ejecutar desde una copia desechable con el parche aplicado, nunca en el repositorio de trabajo:
//   node <ruta a este archivo>
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const HOOK = ".claude/hooks/spec-approval.mjs";
const original = readFileSync(HOOK, "utf8");
const MUTATIONS = [
  ["funcional autoriza gobierno", "if (!hasPrivilege(rel)) {", "if (!hasPrivilege(rel) && !listedInApprovedSpec(rel)) {"],
  ["sin alcance de rutas", "entry.paths.includes(rel) &&", ""],
  ["sin session_id", "entry.session === input.session_id &&", ""],
  ["sin caducidad", "Date.now() < entry.expires &&", ""],
  ["privilegiada sin validez de spec", "return isValid(spec, text) && new Date(date)", "return new Date(date)"],
  ["privilegiada revive al restaurar", "new Date(date) >= new Date(lastApproval(spec).date) && planOpen(text)", "planOpen(text)"],
  ["privilegiada sin plan abierto", "new Date(date) >= new Date(lastApproval(spec).date) && planOpen(text)", "new Date(date) >= new Date(lastApproval(spec).date)"],
  ["privilegiada sin aprobación funcional", "if (!isValid(spec, text)) block(`la spec ${spec} necesita", "if (false) block(`la spec ${spec} necesita"],
  ["registros autorizables", "if (NEVER.test(path) || !GOVERNANCE.test(path))", "if (!GOVERNANCE.test(path) && !NEVER.test(path))"],
  ["registros editables", "if (forms.some((path) => NEVER.test(path))) {", "if (false) {"],
  ["firma sin dominio", '"privileged", root,', '"functional", root,'],
  ["firma sin raíz", '["functional", root, spec', '["functional", spec'],
  ["sensibles por cualquier mención", 'section(text, "Archivos sensibles").includes(rel)', "text.includes(rel)"],
  ["sección por prefijo", "line.trim() === `## ${title}`", "line.startsWith(`## ${title}`)"],
  ["sensibles sin spec válida", "return isValid(spec, text) && planOpen(text) && section", "return planOpen(text) && section"],
  ["sensibles sin plan abierto", "return isValid(spec, text) && planOpen(text) && section", "return isValid(spec, text) && section"],
  ["otro checkout autorizable", "if (!sensitive.ours || !listedInApprovedSpec(rel)) {", "if (sensitive.ours && !listedInApprovedSpec(rel)) {"],
  ["sin chequeo de fase en gate", "if (current && !declared.includes(current)) {", "if (false) {"],
  ["gate solo developer", "if (IMPLEMENTS_NOTHING.has(subagent_type)) return;", 'if (subagent_type !== "developer") return;'],
  ["raíz por CLAUDE_PROJECT_DIR", "(input.cwd && gitRoot(input.cwd)) || process.env.CLAUDE_PROJECT_DIR", "process.env.CLAUDE_PROJECT_DIR"],
  ["sin integridad", "if (existsSync(copy) && digest(copy) !== digest(fileURLToPath(import.meta.url))) {", "if (false) {"],
  ["ruta con espacios ignorada", "/^apruebo(\\s+\\S+|\\s.*\\.md)?$/i", "/^apruebo(\\s+\\S+)?$/i"],
  ["relay no bloquea comando", "if (values.some(command) ||", "if ("],
  ["relay no ve claude", "(shell && values.some(launchesClaude))", "false"],
  ["relay sin PowerShell", "/^(Bash|PowerShell|mcp__terminal__)/", "/^(Bash|mcp__terminal__)/"],
  ["sin alias NTFS", 'part.replace(/:.*$/, "").replace(/[. ]+$/, "")', "part"],
  ["ruta relativa contra root", "resolve(input.cwd ?? root, withoutAliases(path))", "resolve(root, withoutAliases(path))"],
  ["sin canonizar", "const abs = canonical(target);", "const abs = slashes(target);"],
  ["hash ignora línea de estado", "text.replace(STATE_VALUE, \"\")", "text.replace(STATE_LINE, \"\")"],
  ["edit de estado sin archivo resultante", "if (changed && (states(after).length === 0 || !onlyDraft(after))) block(reason);", ""],
  ["developer sin PowerShell", 'tool === "Bash" || tool === "PowerShell" ?', 'tool === "Bash" ?'],
  ["orquestador edita todo", 'block("el orquestador solo edita', '// block("el orquestador solo edita'],
];

let survived = 0;
try {
  for (const [name, from, to] of MUTATIONS) {
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(from)) throw new Error(`mutación sin objetivo: ${name}`);
    writeFileSync(HOOK, normalized.replace(from, () => to));
    const r = spawnSync("npx vitest run .claude/hooks", { shell: true, encoding: "utf8" });
    const caught = r.status !== 0;
    if (!caught) survived += 1;
    console.log(`${caught ? "DETECTADA" : "SOBREVIVE"} | ${name}`);
  }
} finally {
  writeFileSync(HOOK, original);
}
console.log(`mutaciones: ${MUTATIONS.length}, sobreviven: ${survived}`);
