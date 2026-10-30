#!/usr/bin/env python3
"""
嘴替鸭配置 CLI —— 读/写 Storage JSON，调意图/关键词/语录

Storage JSON 怎么来:
  H5 DevTools → Application → Local Storage → http://localhost:10086
  → 找到 zuitiya_scene_config → 右键 Copy value → 存成 config.json

改完后：
  选项 A: python scripts/config_cli.py save --out config.json
          → 把生成的 config.json 粘回 DevTools Local Storage
  选项 B: 直接在 --storage 文件上原地改（--inplace）

用法示例（全）:
  # === 只读 ===
  python scripts/config_cli.py dump --storage config.json
  python scripts/config_cli.py intents --storage config.json       # dump 合并后的全部意图
  python scripts/config_cli.py keywords --intent marriage
  python scripts/config_cli.py quotes
  python scripts/config_cli.py check --utterance "怎么还不结婚"
  python scripts/config_cli.py grep --kw 工资

  # === 写关键词 ===
  python scripts/config_cli.py kw-add --intent marriage --kw 彩礼 --storage config.json
  python scripts/config_cli.py kw-remove --intent marriage --kw 相亲 --storage config.json
  python scripts/config_cli.py kw-set --intent privacy --kws "工资,年终奖,存款" --storage config.json

  # === 写意图 ===
  python scripts/config_cli.py intent-add --name "催买房" --kws "买房,首付,还贷" --weight 1.2 --storage config.json
  python scripts/config_cli.py intent-update --key buy_house --weight 1.5 --storage config.json
  python scripts/config_cli.py intent-remove --key buy_house --storage config.json  # 默认意图会还原覆盖

  # === 写语录 ===
  python scripts/config_cli.py quote-add --content "彩礼是心意不是交易" --category 边界感 --storage config.json
  python scripts/config_cli.py quote-remove --id q_custom_xxx --storage config.json

  # === 保存 ===
  python scripts/config_cli.py save --storage config.json --out config.json       # 输出到新文件
  python scripts/config_cli.py save --storage config.json --inplace               # 原地覆盖
"""

import argparse
import json
import re
import sys
import time
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERIC_KEY = "generic"

# 默认爬虫话题（和前端 sceneConfig.DEFAULT_CRAWL_TOPICS 保持一致，短关键词式）
DEFAULT_CRAWL_TOPICS = [
    '拒绝', '情商', '沟通', '回怼', '嘴替', '社交', '相亲', '职场',
    '催婚', '借钱', '婆媳', '内卷', '人际关系', '高情商', '说话', '怼'
]

# 默认 LLM prompts（和前端 sceneConfig.DEFAULT_PROMPTS 保持一致，精简摘要便于 CLI 展示）
DEFAULT_PROMPTS = {
    'analyze': '意图识别 + 4 风格回话生成',
    'quoteGen': 'LLM 实时生成语录 JSON',
    'rewrite': '话术改写变体',
}


# ================================================================
# 解析 intents.ts / quotes.ts（只读）
# ================================================================

def parse_intents_ts(path: Path):
    text = path.read_text()
    # 匹配每个 intent 块的基本字段（宽松匹配，因为 responses 里也有单引号）
    blocks = re.findall(
        r"\{\s*key:\s*'(\w+)',\s*name:\s*'([^']+)',\s*keywords:\s*\[([^\]]*)\],\s*weight:\s*([\d.]+),\s*intensity:\s*'([^']*)'",
        text,
        re.DOTALL,
    )
    rules = []
    for key, name, kw_str, weight, intensity in blocks:
        kws = re.findall(r"'([^']+)'", kw_str)
        rules.append({
            "key": key,
            "name": name,
            "keywords": kws,
            "weight": float(weight),
            "intensity": intensity,
        })
    return rules


def parse_quotes_ts(path: Path):
    text = path.read_text()
    blocks = re.findall(
        r"\{\s*id:\s*'([^']+)',\s*content:\s*'([^']+)',\s*category:\s*'([^']+)',\s*note:\s*'([^']+)'",
        text,
        re.DOTALL,
    )
    return [{"id": q[0], "content": q[1], "category": q[2], "note": q[3]} for q in blocks]


DEFAULT_RULES = parse_intents_ts(ROOT / "src/data/intents.ts")
DEFAULT_QUOTES = parse_quotes_ts(ROOT / "src/data/quotes.ts")
DEFAULT_KEYS = {r["key"] for r in DEFAULT_RULES}


# ================================================================
# Storage 读写
# ================================================================

def empty_storage():
    return {
        "keywordOverrides": {},
        "customQuotes": [],
        "intentOverrides": {},
        "customIntents": [],
        "crawlTopics": DEFAULT_CRAWL_TOPICS[:],
        "prompts": {},
    }


def load_storage(path: str | None):
    if not path:
        return empty_storage()
    p = Path(path)
    if not p.exists():
        print(f"[warn] 文件不存在，新建空配置: {path}", file=sys.stderr)
        return empty_storage()
    try:
        raw = json.loads(p.read_text())
        merged = empty_storage()
        merged.update(raw)
        # 保证四个 key 都有
        for k in empty_storage():
            merged.setdefault(k, empty_storage()[k])
        return merged
    except Exception as e:
        print(f"[warn] 读取失败，新建空配置: {e}", file=sys.stderr)
        return empty_storage()


def save_storage(storage: dict, path: str):
    Path(path).write_text(json.dumps(storage, ensure_ascii=False, indent=2))
    print(f"[ok] 已写入: {path}")


# ================================================================
# 合并视图（和 sceneConfig.getAllIntentRules 对齐）
# ================================================================

def resolve_all_intents(storage: dict):
    """默认 + keywordOverrides + intentOverrides + customIntents"""
    merged = []
    for r in DEFAULT_RULES:
        kw = (
            storage["keywordOverrides"].get(r["key"])
            or storage["intentOverrides"].get(r["key"], {}).get("keywords")
            or r["keywords"]
        )
        ov = {k: v for k, v in storage["intentOverrides"].get(r["key"], {}).items() if k != "keywords"}
        item = {**r, **ov, "keywords": kw}
        merged.append(item)
    for c in storage["customIntents"]:
        merged.append(c)
    return merged


def resolve_keyword_map(storage: dict):
    rules = resolve_all_intents(storage)
    return {r["key"]: r["keywords"] for r in rules}


# ================================================================
# 写操作（和 sceneConfig 接口一一对应）
# ================================================================

def kw_add(storage, intent_key, kw):
    if not kw.strip():
        print("[err] 关键词不能为空")
        return
    rules = resolve_all_intents(storage)
    target = next((r for r in rules if r["key"] == intent_key), None)
    if not target:
        print(f"[err] 意图不存在: {intent_key}")
        return
    current = list(target["keywords"])
    if kw in current:
        print(f"[skip] 「{kw}」已存在于 {intent_key}")
        return
    current.append(kw)
    # 写入 storage
    if intent_key in DEFAULT_KEYS:
        storage["keywordOverrides"][intent_key] = current
    else:
        for c in storage["customIntents"]:
            if c["key"] == intent_key:
                c["keywords"] = current
                break
    print(f"[ok] 已追加关键词「{kw}」→ {intent_key} (共 {len(current)} 个)")


def kw_remove(storage, intent_key, kw):
    rules = resolve_all_intents(storage)
    target = next((r for r in rules if r["key"] == intent_key), None)
    if not target:
        print(f"[err] 意图不存在: {intent_key}")
        return
    current = list(target["keywords"])
    if kw not in current:
        print(f"[skip] 「{kw}」不在 {intent_key} 的关键词里")
        return
    current.remove(kw)
    if intent_key in DEFAULT_KEYS:
        if current == next(r["keywords"] for r in DEFAULT_RULES if r["key"] == intent_key):
            # 删回默认值了，清理 override
            storage["keywordOverrides"].pop(intent_key, None)
            print(f"[ok] 已移除并还原默认: {intent_key}")
        else:
            storage["keywordOverrides"][intent_key] = current
            print(f"[ok] 已移除「{kw}」 from {intent_key} (剩 {len(current)} 个)")
    else:
        for c in storage["customIntents"]:
            if c["key"] == intent_key:
                c["keywords"] = current
                print(f"[ok] 已移除「{kw}」 from custom {intent_key}")
                break


def kw_set(storage, intent_key, kws):
    rules = resolve_all_intents(storage)
    target = next((r for r in rules if r["key"] == intent_key), None)
    if not target:
        print(f"[err] 意图不存在: {intent_key}")
        return
    if intent_key in DEFAULT_KEYS:
        storage["keywordOverrides"][intent_key] = kws
    else:
        for c in storage["customIntents"]:
            if c["key"] == intent_key:
                c["keywords"] = kws
                break
    print(f"[ok] 已覆盖 {intent_key} 关键词: {kws}")


def intent_add(storage, name, kws, weight, intensity, situation):
    # 生成 key
    key = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or ""
    if not key or key in DEFAULT_KEYS or key in [c["key"] for c in storage["customIntents"]]:
        key = f"custom_{int(time.time())}"
    rule = {
        "key": key,
        "name": name,
        "keywords": kws,
        "weight": weight,
        "intensity": intensity,
        "situation": situation or "",
        "responses": [],
    }
    storage["customIntents"].append(rule)
    print(f"[ok] 已新增意图: {key} ({name})  关键词 {kws}")


def intent_update(storage, key, **fields):
    # custom 的直接改
    for c in storage["customIntents"]:
        if c["key"] == key:
            for k, v in fields.items():
                if v is not None:
                    c[k] = v
            print(f"[ok] 已更新自定义意图 {key}: {fields}")
            return
    # 默认意图
    if key in DEFAULT_KEYS:
        ov = storage["intentOverrides"].get(key, {})
        kw_over = storage["keywordOverrides"].get(key)
        intent_kw = fields.pop("keywords", None)
        for k, v in fields.items():
            if v is not None:
                ov[k] = v
        if intent_kw is not None:
            storage["keywordOverrides"][key] = intent_kw
        if ov:
            storage["intentOverrides"][key] = ov
        print(f"[ok] 已覆盖默认意图 {key}: {fields}" + (f" + keywords={intent_kw}" if intent_kw else ""))
        return
    print(f"[err] 意图不存在: {key}")


def intent_remove(storage, key):
    if key == GENERIC_KEY:
        print("[err] 不能删除万能兜底意图")
        return
    # custom 直接删
    before = len(storage["customIntents"])
    storage["customIntents"] = [c for c in storage["customIntents"] if c["key"] != key]
    if len(storage["customIntents"]) < before:
        print(f"[ok] 已删除自定义意图: {key}")
        return
    # 默认意图 = 还原覆盖
    if key in DEFAULT_KEYS:
        storage["keywordOverrides"].pop(key, None)
        storage["intentOverrides"].pop(key, None)
        print(f"[ok] 已还原默认意图的覆盖: {key}")
        return
    print(f"[err] 意图不存在: {key}")


def quote_add(storage, content, category, note, keywords):
    qid = f"q_custom_{int(time.time())}_{__import__('random').randint(1000, 9999)}"
    q = {
        "id": qid,
        "content": content,
        "category": category or "社区热话",
        "note": note or "",
        "source": "fixed",
        "keywords": keywords or [],
    }
    storage["customQuotes"].append(q)
    print(f"[ok] 已新增语录: {qid}  「{content[:30]}」")


def quote_remove(storage, qid):
    before = len(storage["customQuotes"])
    storage["customQuotes"] = [q for q in storage["customQuotes"] if q["id"] != qid]
    if len(storage["customQuotes"]) < before:
        print(f"[ok] 已删除自定义语录: {qid}")
    else:
        print(f"[err] 找不到自定义语录: {qid} (默认语录删不动)")


# ================================================================
# 爬虫话题（和前端 sceneConfig 同逻辑）
# ================================================================

def resolve_topics(storage):
    """用户配置优先，否则用默认"""
    custom = storage.get("crawlTopics")
    if custom and len(custom) > 0:
        return custom
    return DEFAULT_CRAWL_TOPICS[:]


def topics_add(storage, topic):
    topic = topic.strip()
    if not topic:
        print("[err] 话题不能为空")
        return
    current = resolve_topics(storage)
    if topic in current:
        print(f"[skip] 话题已存在: {topic}")
        return
    # 如果现在还是默认列表，先复制一份避免直接改 DEFAULT
    if storage.get("crawlTopics") is None or storage["crawlTopics"] == DEFAULT_CRAWL_TOPICS:
        storage["crawlTopics"] = DEFAULT_CRAWL_TOPICS[:]
    storage["crawlTopics"].append(topic)
    print(f"[ok] 已追加话题: {topic}  (共 {len(storage['crawlTopics'])} 个)")


def topics_remove(storage, topic):
    current = resolve_topics(storage)
    if topic not in current:
        print(f"[skip] 话题不存在: {topic}")
        return
    filtered = [t for t in current if t != topic]
    # 删空了就回到默认
    storage["crawlTopics"] = filtered if filtered else DEFAULT_CRAWL_TOPICS[:]
    print(f"[ok] 已移除话题: {topic}  (剩 {len(storage['crawlTopics'])} 个)")


def topics_set(storage, topics):
    storage["crawlTopics"] = [t.strip() for t in topics if t.strip()]
    if not storage["crawlTopics"]:
        storage["crawlTopics"] = DEFAULT_CRAWL_TOPICS[:]
    print(f"[ok] 已覆盖话题列表: {storage['crawlTopics']}")


# ================================================================
# LLM prompts
# ================================================================

def prompt_get(storage, key):
    prompts = storage.get("prompts") or {}
    value = prompts.get(key)
    default = DEFAULT_PROMPTS.get(key, "(未知 key)")
    is_overridden = key in prompts and value is not None
    print(f"\n  prompt key: {key}")
    print(f"  状态: {'⚡已覆盖' if is_overridden else '默认'}")
    print(f"  简介: {default}")
    if is_overridden:
        print(f"  覆盖值 (前 200 字):\n  {value[:200]}{'…' if len(value) > 200 else ''}")
    else:
        print(f"  当前使用前端 sceneConfig.DEFAULT_PROMPTS 里的默认全文")


def prompt_set(storage, key, value_file):
    # value 可以直接传字符串，或从文件读取（更方便长 prompt）
    if value_file.startswith('@'):
        path = Path(value_file[1:])
        if not path.exists():
            print(f"[err] 文件不存在: {path}")
            return
        value = path.read_text()
    else:
        value = value_file

    if not storage.get("prompts"):
        storage["prompts"] = {}
    storage["prompts"][key] = value
    print(f"[ok] 已覆盖 prompt: {key} ({len(value)} 字)")


def prompt_reset(storage, key):
    if storage.get("prompts") and key in storage["prompts"]:
        del storage["prompts"][key]
        if not storage["prompts"]:
            del storage["prompts"]
        print(f"[ok] 已还原为默认: {key}")
    else:
        print(f"[skip] {key} 没有覆盖值，已经是默认")


def cmd_prompts(storage):
    print(f"\n  LLM System Prompts")
    print(f"  {'='*40}")
    print(f"  {'key':<12} {'状态':<10} 简介")
    print(f"  {'-'*60}")
    overrides = storage.get("prompts") or {}
    for key, desc in DEFAULT_PROMPTS.items():
        state = "⚡覆盖" if key in overrides else "默认"
        print(f"  {key:<12} {state:<10} {desc}")
    if overrides:
        print(f"\n  覆盖 keys: {list(overrides.keys())}")


# ================================================================
# 只读打印
# ================================================================

def cmd_dump(storage):
    kw_map = resolve_keyword_map(storage)
    rules = resolve_all_intents(storage)
    is_default = {r["key"]: r["key"] in DEFAULT_KEYS for r in rules}

    print(f"{'='*60}")
    print(f"  嘴替鸭 合并后关键词表  ({len(rules)} 个意图)")
    print(f"{'='*60}")
    for r in rules:
        kws = kw_map[r["key"]]
        flags = []
        if not is_default[r["key"]]:
            flags.append("🆕新增")
        elif r["key"] in storage["keywordOverrides"] or r["key"] in storage["intentOverrides"]:
            flags.append("⚡已覆盖")
        flag = f"  ({' '.join(flags)})" if flags else ""
        print(f"\n  {r['key']}  ({r['name']})  w={r['weight']} i={r['intensity']}{flag}")
        print(f"    [{', '.join(kws)}]")

    if storage["customQuotes"]:
        print(f"\n{'='*60}")
        print(f"  自定义固定语录  ({len(storage['customQuotes'])} 条)")
        print(f"{'='*60}")
        for q in storage["customQuotes"]:
            print(f"  [{q['category']}] {q['content'][:45]}")


def cmd_intents(storage):
    rules = resolve_all_intents(storage)
    print(f"\n  完整意图列表 ({len(rules)} 个):")
    print(f"  {'key':<20} {'name':<10} {'w':<5} {'i':<8} {'来源'}")
    print(f"  {'-'*55}")
    for r in rules:
        origin = "默认" if r["key"] in DEFAULT_KEYS else "自定义"
        print(f"  {r['key']:<20} {r['name']:<10} {r['weight']:<5} {r['intensity']:<8} {origin}")


def cmd_quotes(storage):
    all_q = DEFAULT_QUOTES + storage["customQuotes"]
    from collections import Counter
    cat = Counter(q["category"] for q in all_q)
    print(f"{'='*60}")
    print(f"  固定语录库  {len(all_q)} 条 (默认 {len(DEFAULT_QUOTES)} + 自定义 {len(storage['customQuotes'])})")
    print(f"{'='*60}")
    for q in all_q:
        tag = "🆕" if q in storage["customQuotes"] else "  "
        print(f"  {tag} [{q['category']}] {q['content'][:50]}")
    print(f"\n  分类: {dict(cat)}")


def cmd_check(utterance, storage):
    rules = resolve_all_intents(storage)
    kw_map = resolve_keyword_map(storage)
    best = None
    best_score = 0
    for r in rules:
        hits = [kw for kw in kw_map.get(r["key"], []) if kw in utterance]
        if hits:
            score = r["weight"] * len(hits)
            if score > best_score:
                best_score = score
                best = {**r, "matched": hits, "score": score}
    generic = next((r for r in rules if r["key"] == GENERIC_KEY), None)
    result = best or {**generic, "matched": [], "score": 0}

    print(f"\n  输入: 「{utterance}」")
    if result["matched"]:
        print(f"  ✅ 命中: {result['key']} ({result['name']})  得分 {result['score']}")
        print(f"     关键词: {result['matched']}")
    else:
        print(f"  ⚠️  无关键词命中 → 万能兜底 (generic)")


def cmd_grep(kw, storage):
    rules = resolve_all_intents(storage)
    kw_map = resolve_keyword_map(storage)
    all_q = DEFAULT_QUOTES + storage["customQuotes"]

    hit_rules = [r for r in rules if kw in kw_map.get(r["key"], [])]
    hit_quotes = [q for q in all_q if kw in q["content"]]

    print(f"\n  关键词「{kw}」反查:")
    print(f"  {'='*40}")
    print(f"  📌 意图规则 ({len(hit_rules)}):")
    for r in hit_rules:
        print(f"     - {r['key']} ({r['name']})")
    print(f"  📌 固定语录 ({len(hit_quotes)}):")
    for q in hit_quotes:
        src = "自定义" if q in storage["customQuotes"] else "默认"
        print(f"     - [{q['category']}] ({src}) {q['content'][:50]}")


def cmd_topics(storage):
    topics = resolve_topics(storage)
    is_default = storage.get("crawlTopics") is None or storage["crawlTopics"] == DEFAULT_CRAWL_TOPICS
    print(f"\n  爬虫话题 (共 {len(topics)} 个)  {'[默认]' if is_default else '[自定义]'}")
    print(f"  {'='*40}")
    for i, t in enumerate(topics, 1):
        print(f"    {i}. {t}")


def cmd_crawl_config(storage):
    limit = storage.get("dailyQuoteLimit", 100)
    ttl = storage.get("dailyQuoteTTLDays", 7)
    topics = resolve_topics(storage)
    print(f"\n  每日库配置")
    print(f"  {'='*40}")
    print(f"    每日入库上限: {limit} 条  {'[默认]' if 'dailyQuoteLimit' not in storage else ''}")
    print(f"    TTL 过期天数: {ttl} 天  {'[默认]' if 'dailyQuoteTTLDays' not in storage else ''}")
    print(f"    爬取话题数:   {len(topics)} 个")
    print(f"    爬取话题:     {', '.join(topics[:5])}{'...' if len(topics) > 5 else ''}")
    print(f"    排序权重:     点赞 × 0.6 + 关键词匹配度 × 0.4 → Top N")


# ================================================================
# main
# ================================================================

def main():
    parser = argparse.ArgumentParser(description="嘴替鸭 Storage 配置 CLI", formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--storage", required=True, help="Storage JSON 文件路径")
    sub = parser.add_subparsers(dest="cmd")

    # 只读
    sub.add_parser("dump", help="完整合并配置快照")
    sub.add_parser("intents", help="合并后的意图列表")
    sub.add_parser("quotes", help="固定语录库")

    p_check = sub.add_parser("check", help="模拟意图匹配")
    p_check.add_argument("--utterance", required=True)

    p_grep = sub.add_parser("grep", help="反查关键词")
    p_grep.add_argument("--kw", required=True)

    # 写关键词
    p_add = sub.add_parser("kw-add", help="追加关键词")
    p_add.add_argument("--intent", required=True)
    p_add.add_argument("--kw", required=True)

    p_rm = sub.add_parser("kw-remove", help="删除关键词")
    p_rm.add_argument("--intent", required=True)
    p_rm.add_argument("--kw", required=True)

    p_set = sub.add_parser("kw-set", help="覆盖整个关键词组 (逗号分隔)")
    p_set.add_argument("--intent", required=True)
    p_set.add_argument("--kws", required=True, help="kw1,kw2,kw3")

    # 写意图
    p_ia = sub.add_parser("intent-add", help="新增意图")
    p_ia.add_argument("--name", required=True)
    p_ia.add_argument("--kws", required=True, help="逗号分隔")
    p_ia.add_argument("--weight", type=float, default=1.0)
    p_ia.add_argument("--intensity", default="medium")
    p_ia.add_argument("--situation", default="")

    p_iu = sub.add_parser("intent-update", help="更新意图字段")
    p_iu.add_argument("--key", required=True)
    p_iu.add_argument("--name")
    p_iu.add_argument("--kws", help="逗号分隔的新关键词组")
    p_iu.add_argument("--weight", type=float)
    p_iu.add_argument("--intensity")

    p_ir = sub.add_parser("intent-remove", help="删除自定义意图 / 还原默认")
    p_ir.add_argument("--key", required=True)

    # 写语录
    p_qa = sub.add_parser("quote-add", help="新增固定语录")
    p_qa.add_argument("--content", required=True)
    p_qa.add_argument("--category", default="社区热话")
    p_qa.add_argument("--note", default="")
    p_qa.add_argument("--kws", default="", help="逗号分隔的关键词")

    p_qr = sub.add_parser("quote-remove", help="删除自定义语录")
    p_qr.add_argument("--id", required=True)

    # 爬虫话题
    sub.add_parser("topics", help="查看爬虫话题")

    p_ta = sub.add_parser("topic-add", help="追加爬虫话题")
    p_ta.add_argument("--topic", required=True)

    p_tr = sub.add_parser("topic-remove", help="移除爬虫话题")
    p_tr.add_argument("--topic", required=True)

    p_ts = sub.add_parser("topic-set", help="覆盖全部话题 (逗号分隔)")
    p_ts.add_argument("--topics", required=True, help="t1,t2,t3")

    # LLM prompts
    sub.add_parser("prompts", help="列出所有 prompt key")

    p_pg = sub.add_parser("prompt-get", help="查看某个 prompt")
    p_pg.add_argument("--key", required=True, choices=list(DEFAULT_PROMPTS.keys()))

    p_ps = sub.add_parser("prompt-set", help="覆盖 prompt (直接传文本 或 @文件路径)")
    p_ps.add_argument("--key", required=True, choices=list(DEFAULT_PROMPTS.keys()))
    p_ps.add_argument("--value", required=True, help='"新文本内容" 或 @prompt.txt')

    p_pr = sub.add_parser("prompt-reset", help="还原为默认 prompt")
    p_pr.add_argument("--key", required=True, choices=list(DEFAULT_PROMPTS.keys()))

    # 每日库参数
    sub.add_parser("crawl-config", help="查看每日库参数 (limit/TTL/话题)")
    p_dl = sub.add_parser("daily-limit-set", help="设置每日入库条数上限 (1~500, 默认 100)")
    p_dl.add_argument("--n", type=int, required=True)
    p_dt = sub.add_parser("daily-ttl-set", help="设置每日语录 TTL 天数 (1~30, 默认 7)")
    p_dt.add_argument("--d", type=int, required=True)

    # 保存
    p_save = sub.add_parser("save", help="写回 Storage JSON")
    p_save.add_argument("--out", help="输出到新文件")
    p_save.add_argument("--inplace", action="store_true", help="原地覆盖 --storage 文件")

    args = parser.parse_args()
    storage = load_storage(args.storage)
    need_save = False

    # 只读
    if args.cmd == "dump":
        cmd_dump(storage)
    elif args.cmd == "intents":
        cmd_intents(storage)
    elif args.cmd == "quotes":
        cmd_quotes(storage)
    elif args.cmd == "check":
        cmd_check(args.utterance, storage)
    elif args.cmd == "grep":
        cmd_grep(args.kw, storage)
    elif args.cmd == "topics":
        cmd_topics(storage)

    # 写关键词
    elif args.cmd == "kw-add":
        kw_add(storage, args.intent, args.kw)
        need_save = True
    elif args.cmd == "kw-remove":
        kw_remove(storage, args.intent, args.kw)
        need_save = True
    elif args.cmd == "kw-set":
        kw_set(storage, args.intent, [k.strip() for k in args.kws.split(",") if k.strip()])
        need_save = True

    # 写意图
    elif args.cmd == "intent-add":
        intent_add(
            storage, args.name,
            [k.strip() for k in args.kws.split(",") if k.strip()],
            args.weight, args.intensity, args.situation,
        )
        need_save = True
    elif args.cmd == "intent-update":
        intent_update(
            storage, args.key,
            name=args.name,
            keywords=[k.strip() for k in args.kws.split(",")] if args.kws else None,
            weight=args.weight,
            intensity=args.intensity,
        )
        need_save = True
    elif args.cmd == "intent-remove":
        intent_remove(storage, args.key)
        need_save = True

    # 写语录
    elif args.cmd == "quote-add":
        quote_add(
            storage, args.content, args.category, args.note,
            [k.strip() for k in args.kws.split(",") if k.strip()],
        )
        need_save = True
    elif args.cmd == "quote-remove":
        quote_remove(storage, args.id)
        need_save = True

    # 写话题
    elif args.cmd == "topic-add":
        topics_add(storage, args.topic)
        need_save = True
    elif args.cmd == "topic-remove":
        topics_remove(storage, args.topic)
        need_save = True
    elif args.cmd == "topic-set":
        topics_set(storage, [t.strip() for t in args.topics.split(",") if t.strip()])
        need_save = True

    # prompts
    elif args.cmd == "prompts":
        cmd_prompts(storage)
    elif args.cmd == "prompt-get":
        prompt_get(storage, args.key)
    elif args.cmd == "prompt-set":
        prompt_set(storage, args.key, args.value)
        need_save = True
    elif args.cmd == "prompt-reset":
        prompt_reset(storage, args.key)
        need_save = True

    # 每日库参数
    elif args.cmd == "crawl-config":
        cmd_crawl_config(storage)
    elif args.cmd == "daily-limit-set":
        storage["dailyQuoteLimit"] = max(1, min(500, int(args.n)))
        print(f"[ok] dailyQuoteLimit = {storage['dailyQuoteLimit']}")
        need_save = True
    elif args.cmd == "daily-ttl-set":
        storage["dailyQuoteTTLDays"] = max(1, min(30, int(args.d)))
        print(f"[ok] dailyQuoteTTLDays = {storage['dailyQuoteTTLDays']}")
        need_save = True

    # 保存
    elif args.cmd == "save":
        if args.inplace:
            save_storage(storage, args.storage)
        elif args.out:
            save_storage(storage, args.out)
        else:
            print("[err] save 需要 --inplace 或 --out <path>")
    else:
        parser.print_help()

    # 写操作自动保存（除非用户明确想先不存，一般直接存了方便）
    if need_save:
        save_storage(storage, args.storage)


if __name__ == "__main__":
    main()
