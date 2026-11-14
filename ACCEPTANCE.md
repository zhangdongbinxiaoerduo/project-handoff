# ACCEPTANCE.md · 交接体系（project-handoff）

第一个验证对象是这套东西自己：它的失败模式恰好就是"文档写得像那么回事，实际用起来不管用"。

## 自动

| 编号 | 检查什么 | 判据 |
|---|---|---|
| A1 | SKILL.md 存在且 frontmatter 有 name / description | 脚本退出码 0 |
| A2 | 验收模板含「自动」「人工」「checks 围栏」三节 | 脚本退出码 0 |
| A3 | 三态逻辑本身正确（PASS/FAIL/UNVERIFIED 与退出码 0/1/2） | 自检退出码 0 |
| A4 | SKILL.md 里引用的路径没有死链 | 脚本退出码 0 |
| A5 | 在真实项目上生成过一次交接材料 | **UNVERIFIED**（还没跑过） |

## 人工

| 编号 | 看什么 | 判据 |
|---|---|---|
| M1 | 我说"卡住了"，材料里带报错原文 + 已试动作 + 卡点 | 生成一次看 |
| M2 | 我说"不满意"，它先追问再给约束，不要我先说清楚 | 生成一次看 |
| M3 | 材料带共同头（目标/基线/相关文件/待决问题/自动验收） | 读一遍 |
| M4 | 回写能标出替代了哪条旧约束 | 写一次变更单 |
| M5 | 默认不上传任何东西（gist / 截图 / 远端） | 看它是否擅自发布 |

```checks
{"id":"A1","run":"node scripts/check.mjs --verify-structure"}
{"id":"A2","run":"node scripts/check.mjs --verify-template"}
{"id":"A3","run":"node scripts/check.mjs --self-test"}
{"id":"A4","run":"node scripts/check.mjs --verify-links"}
{"id":"A5","unverified":"还没在真实项目上跑过一次交接"}
```
