---
name: current-state-lookup
description: >-
  根据需求描述，从 GitHub 设计仓库中检索相关设计文档，输出详细的现状说明。
  当用户说"帮我了解现状"、"这个需求的现状是什么"、"查一下设计文档"、"现有功能是怎么做的"、
  "迭代前的设计是什么"时使用。也适用于：用户描述一个新需求，想知道现有系统已经支持了什么。
---

# Current State Lookup from Design Repository

根据需求描述，自动从 GitHub 设计仓库检索相关设计文档，输出结构化的现状说明。

## 设计仓库

默认仓库：`https://github.com/w00victoria82-del/co-designs`

仓库中包含：
- `axure-parsed-result/prd-full.md` — 从 Axure 原型提取的完整设计文档
- `PRD-*.md` — 已整理的 PRD 文档

## Workflow

```
Current State Lookup Progress:
- [ ] 获取用户需求描述
- [ ] 拉取/更新设计仓库内容
- [ ] 运行检索脚本，提取相关内容
- [ ] 读取检索结果
- [ ] 读取 prompt 模板
- [ ] 生成现状说明
- [ ] 输出结果
```

## Step 1: 获取需求描述

从用户输入中提取需求描述。如果用户没有提供，询问：
- 你想了解哪个功能/模块的现状？
- 你的新需求是什么？（用于匹配相关设计内容）

## Step 2: 拉取设计仓库

运行检索脚本，从 GitHub 拉取最新设计文档并检索相关内容：

```bash
node {skill-dir}/scripts/fetch-designs.js "<需求描述>" <output-dir> [--repo <github-repo-url>]
```

**参数：**
- `<需求描述>` — 用户的需求描述，用于关键词匹配
- `<output-dir>` — 检索结果输出目录（默认 `./current-state-output`）
- `--repo` — GitHub 仓库地址（默认 `w00victoria82-del/co-designs`）

**输出：**
```
<output-dir>/
  matched.md    # 匹配到的相关设计内容片段
  summary.json  # 匹配统计（匹配页面数、关键词命中情况）
```

## Step 3: 读取检索结果

读取 `<output-dir>/matched.md` 和 `summary.json`。

## Step 4: 读取 prompt 模板

读取：
```
{skill-dir}/prompts/current-state-analyzer.md
```

## Step 5: 生成现状说明

你 IS the LLM。将检索到的设计内容 + 用户需求描述，按 prompt 模板生成现状说明：

1. 识别需求涉及的功能模块
2. 从匹配内容中提取现有设计规则、交互逻辑、边界条件
3. 输出结构化现状说明（见 prompt 模板中的输出结构）

## Step 6: 输出结果

直接在对话中输出现状说明，无需写文件（除非用户要求保存）。

## Error Handling

| 错误 | 处理方式 |
|------|---------|
| 脚本找不到 | 检查路径 `{skill-dir}/scripts/fetch-designs.js` |
| GitHub 访问失败 | 提示用户检查网络或 `gh auth status` |
| 未找到相关内容 | 告知用户仓库中暂无匹配内容，列出仓库中已有的文档 |
| 需求描述太模糊 | 询问用户补充关键词 |

## Notes

- 检索基于关键词匹配，支持中文分词
- 匹配范围：页面标题、功能描述、规则说明
- 仓库地址可通过 `--repo` 参数覆盖，支持团队扩展到其他仓库
