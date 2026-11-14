#!/usr/bin/env node
/**
 * 可选小工具：按 ACCEPTANCE.md 里的 ```checks 围栏逐条跑命令并汇总。
 *
 * 这不是门禁，也不是流程的一部分。
 * 它只回答「这几条命令跑得怎么样」，怎么用、算不算通过，由人和 Chat 判断。
 *
 * 用法：
 *   node optional/check.mjs --file path/to/ACCEPTANCE.md
 *   node optional/check.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const PASS = '通过'
const FAIL = '不通过'
const UNV = '未验证'

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

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

const runOne = (spec, cwd) => {
  if (spec.parseError !== undefined) return [FAIL, `JSON 解析失败：${spec.parseError}`]
  if (typeof spec.unverified === 'string') return [UNV, spec.unverified]
  if (!spec.run) return [UNV, '没有 run 命令']
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
  for (const row of rows) {
    console.log(`  ${String(row.id).padEnd(idWidth)}  ${String(row.state).padEnd(4)}  ${row.note ?? ''}`)
  }
  const n = (state) => rows.filter((r) => r.state === state).length
  console.log(`\n  ${rows.length} 项：${n(PASS)} 通过 / ${n(FAIL)} 不通过 / ${n(UNV)} 未验证`)
  console.log('  → 这些数字只是事实。算不算做完，不在这里决定。')
}

const exitCodeFor = (rows) => {
  if (rows.some((r) => r.state === FAIL)) return 1
  if (rows.some((r) => r.state === UNV)) return 2
  return 0
}

const selfTest = () => {
  const cases = [
    ['通过', runOne({ id: 'T1', run: 'node -e "process.exit(0)"' }), PASS],
    ['不通过', runOne({ id: 'T2', run: 'node -e "process.exit(1)"' }), FAIL],
    ['未验证', runOne({ id: 'T3', unverified: '故意留空' }), UNV],
    ['无 run', runOne({ id: 'T4' }), UNV],
  ]
  let ok = true
  for (const [name, got, want] of cases) {
    const good = got[0] === want
    if (!good) ok = false
    console.log(`  ${good ? 'ok  ' : 'BAD '} ${name}: 期望 ${want}，实际 ${got[0]}`)
  }
  process.exit(ok ? 0 : 1)
}

if (has('--self-test')) selfTest()

const file = valueOf('--file') ?? 'ACCEPTANCE.md'
const target = resolve(process.cwd(), file)
if (!existsSync(target)) {
  console.error(`  找不到 ${target}`)
  process.exit(2)
}

const specs = extractChecks(readFileSync(target, 'utf8'))
if (specs === null) {
  console.error('  文件里没有 ```checks 围栏')
  process.exit(2)
}

const rows = specs.map((spec) => {
  const [state, note] = runOne(spec, process.cwd())
  return { id: spec.id ?? '?', state, note }
})

console.log('')
print(rows)
process.exit(exitCodeFor(rows))
