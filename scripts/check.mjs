#!/usr/bin/env node
/**
 * 诚实的检查骨架。
 *
 * 三态，没有第四种：
 *   PASS        跑过、确实对          → 退出码 0
 *   FAIL        跑过、确实不对        → 退出码 1
 *   UNVERIFIED  没跑 / 跑不了 / 没实现 → 退出码 2
 *
 * 硬规则：未注册、未实现、跑不出结论的，一律 UNVERIFIED。
 * 宁可让整体退出码非零，也不给执行层一个假的完成信号。
 *
 * 用法：
 *   node scripts/check.mjs                   读当前目录的 ACCEPTANCE.md
 *   node scripts/check.mjs --file path.md    指定文件
 *   node scripts/check.mjs --self-test       验证三态逻辑本身是对的
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(HERE, '..')

const PASS = 'PASS'
const FAIL = 'FAIL'
const UNV = 'UNVERIFIED'

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

/** 从 markdown 里取出 ```checks 围栏中的每行 JSON。 */
const extractChecks = (md) => {
  const fence = md.match(/```checks\r?\n([\s\S]*?)```/)
  if (!fence) return null
  return fence[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { id: '?', parseError: line }
      }
    })
}

/** 执行一项检查，返回 [状态, 说明]。 */
const runOne = (spec, cwd) => {
  if (spec.parseError !== undefined) return [FAIL, `JSON 解析失败：${spec.parseError}`]
  if (typeof spec.unverified === 'string') return [UNV, spec.unverified]
  if (!spec.run) return [UNV, '未实现（没有 run 命令）']
  const result = spawnSync(spec.run, {
    shell: true,
    cwd: spec.cwd ? resolve(cwd, spec.cwd) : cwd,
    encoding: 'utf8',
  })
  if (result.status === 0) return [PASS, '']
  const tail = (result.stderr || result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0]
  return [FAIL, `退出码 ${result.status}${tail ? ` · ${tail}` : ''}`]
}

const print = (rows) => {
  const idWidth = Math.max(4, ...rows.map((r) => String(r.id).length))
  const stateWidth = Math.max(PASS.length, UNV.length)
  for (const row of rows) {
    const id = String(row.id).padEnd(idWidth)
    const state = String(row.state).padEnd(stateWidth)
    console.log(`  ${id}  ${state}  ${row.note ?? ''}`)
  }
  const passed = rows.filter((r) => r.state === PASS).length
  const failed = rows.filter((r) => r.state === FAIL).length
  const unverified = rows.filter((r) => r.state === UNV).length
  console.log(`\n  ${rows.length} 项：${passed} 通过 / ${failed} 失败 / ${unverified} 未验证`)
  if (failed > 0) console.log('  → 结论：没做完')
  else if (unverified > 0) console.log('  → 结论：未验证，不算做完')
  else console.log('  → 结论：自动检查全绿（人工栏仍需你自己看）')
}

const exitCodeFor = (rows) => {
  if (rows.some((r) => r.state === FAIL)) return 1
  if (rows.some((r) => r.state === UNV)) return 2
  return 0
}

/** 验证三态逻辑本身：造几个已知答案，看是否判对。 */
const selfTest = () => {
  const cases = [
    ['pass-case', runOne({ id: 'T1', run: 'node -e "process.exit(0)"' }, process.cwd()), PASS],
    ['fail-case', runOne({ id: 'T2', run: 'node -e "process.exit(1)"' }, process.cwd()), FAIL],
    ['unverified-case', runOne({ id: 'T3', unverified: '故意留空' }, process.cwd()), UNV],
    ['empty-case', runOne({ id: 'T4' }, process.cwd()), UNV],
    ['parse-case', runOne({ id: 'T5', parseError: '{oops' }, process.cwd()), FAIL],
  ]
  let ok = true
  for (const [name, got, want] of cases) {
    const good = got[0] === want
    if (!good) ok = false
    console.log(`  ${good ? 'ok  ' : 'BAD '} ${name}: 期望 ${want}，实际 ${got[0]}`)
  }
  const cleanExit = exitCodeFor([{ state: PASS }, { state: PASS }])
  const dirtyExit = exitCodeFor([{ state: PASS }, { state: UNV }])
  const badExit = exitCodeFor([{ state: PASS }, { state: FAIL }])
  const exits = cleanExit === 0 && dirtyExit === 2 && badExit === 1
  if (!exits) ok = false
  console.log(`  ${exits ? 'ok  ' : 'BAD '} 退出码: 全绿=${cleanExit} 含未验证=${dirtyExit} 含失败=${badExit}`)
  process.exit(ok ? 0 : 1)
}

const verifyStructure = () => {
  const skill = join(SKILL_ROOT, 'SKILL.md')
  if (!existsSync(skill)) {
    console.error('  缺 SKILL.md')
    process.exit(1)
  }
  const text = readFileSync(skill, 'utf8')
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const hasName = Boolean(front) && /^name:\s*\S+/m.test(front[1])
  const hasDesc = Boolean(front) && /^description:\s*\S+/m.test(front[1])
  console.log(`  SKILL.md 存在，frontmatter name=${hasName} description=${hasDesc}`)
  process.exit(hasName && hasDesc ? 0 : 1)
}

const verifyTemplate = () => {
  const tpl = join(SKILL_ROOT, 'references', 'acceptance-template.md')
  if (!existsSync(tpl)) {
    console.error('  缺 references/acceptance-template.md')
    process.exit(1)
  }
  const text = readFileSync(tpl, 'utf8')
  const need = ['## 自动', '## 人工', '```checks']
  const missing = need.filter((token) => !text.includes(token))
  console.log(`  模板缺项：${missing.length ? missing.join(' / ') : '无'}`)
  process.exit(missing.length ? 1 : 0)
}

const verifyLinks = () => {
  const skill = join(SKILL_ROOT, 'SKILL.md')
  if (!existsSync(skill)) {
    console.error('  缺 SKILL.md')
    process.exit(1)
  }
  const text = readFileSync(skill, 'utf8')
  const refs = [...text.matchAll(/(?:references|scripts)\/[A-Za-z0-9._-]+/g)].map((m) => m[0])
  const unique = [...new Set(refs)]
  const dead = unique.filter((rel) => !existsSync(join(SKILL_ROOT, rel)))
  console.log(`  引用 ${unique.length} 个路径，死链 ${dead.length}${dead.length ? '：' + dead.join(', ') : ''}`)
  process.exit(dead.length ? 1 : 0)
}

/** 交接材料必须带共同底座五项，且写出触发类型。缺一项就判 FAIL。 */
const verifyHandoff = () => {
  const dir = join(SKILL_ROOT, 'docs', 'handoff')
  if (!existsSync(dir)) {
    console.error('  缺 docs/handoff/ 目录 → 没有任何交接材料')
    process.exit(1)
  }
  const files = readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  if (files.length === 0) {
    console.error('  docs/handoff/ 里没有 .md 交接材料')
    process.exit(1)
  }
  const latest = files[files.length - 1]
  const text = readFileSync(join(dir, latest), 'utf8')
  const commons = ['任务目标', '基线', '相关文件', '待决问题', '自动验收']
  const triggers = ['## 看效果', '## 卡住', '## 不满意']
  const missingCommon = commons.filter((token) => !text.includes(token))
  const trigger = triggers.find((token) => text.includes(token))
  console.log(`  最新交接：${latest}`)
  console.log(`  共同底座缺项：${missingCommon.length ? missingCommon.join(' / ') : '无'}`)
  console.log(`  触发类型：${trigger ? trigger.replace('## ', '') : '缺失'}`)
  process.exit(missingCommon.length === 0 && trigger ? 0 : 1)
}

if (has('--self-test')) selfTest()
if (has('--verify-structure')) verifyStructure()
if (has('--verify-template')) verifyTemplate()
if (has('--verify-links')) verifyLinks()
if (has('--verify-handoff')) verifyHandoff()

const file = valueOf('--file') ?? 'ACCEPTANCE.md'
const target = resolve(process.cwd(), file)
if (!existsSync(target)) {
  console.error(`  找不到 ${target}，无法判定 → UNVERIFIED`)
  process.exit(2)
}

const specs = extractChecks(readFileSync(target, 'utf8'))
if (specs === null) {
  console.error('  ACCEPTANCE.md 里没有 ```checks 围栏，一项都判不了 → UNVERIFIED')
  process.exit(2)
}

const rows = specs.map((spec) => {
  const [state, note] = runOne(spec, process.cwd())
  return { id: spec.id ?? '?', state, note }
})

console.log('')
print(rows)
process.exit(exitCodeFor(rows))
