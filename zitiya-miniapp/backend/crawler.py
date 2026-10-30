"""每日语录入库 —— 从真实平台热榜拉取 + 话题过滤，回退到本地语料池

数据源：uapis.cn 免费热榜聚合（微博/知乎/抖音/B站/小红书等 40+ 平台，无需 key、服务端可抓）。
原微博 PC 搜索页 (s.weibo.com) 自 2023 起全量加登录墙，已彻底失效；小红书/知乎/抖音
等也无公开 API，无法稳定直爬。uapis 聚合的是各平台实时热榜（泛热点），因此 语录库
= 真实热点语录 + seed 嘴替段子(保底) 的混合体。话题(crawl_topics) 作为过滤锚点，
只保留命中话题的热条入库，让"话题管理"真正生效。拉取失败或当天无命中 → 回退语料池。
"""
import json
import time
import logging
from datetime import datetime, timedelta, timezone

import httpx

from sqlalchemy.orm import Session

from .database import DailyQuote
from .config_store import get_crawl_topics, get_daily_limit, get_ttl_days

logger = logging.getLogger(__name__)

HOT_BASE = "https://uapis.cn/api/v1/misc/hotboard"
PLATFORMS = [
    (["weibo"], "微博热搜"),
    (["zhihu"], "知乎热榜"),
    (["douyin"], "抖音热点"),
    (["bilibili"], "B站热门"),
    (["xiaohongshu", "rednote", "xhs"], "小红书热点"),
    (["toutiao"], "头条热榜"),
]
POOL_PATH = __file__.replace("crawler.py", "daily_pool.json")

# 默认话题关键词（短词式，更易命中热榜标题）。可在管理后台「话题管理」自定义。
DEFAULT_TOPICS = ["拒绝", "情商", "沟通", "回怼", "嘴替", "社交", "相亲", "职场", "催婚", "借钱", "婆媳", "内卷", "人际关系", "高情商", "说话", "怼"]


def load_pool() -> list[dict]:
    try:
        with open(POOL_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"语料池读取失败: {e}")
        return []


def parse_hot(v):
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = v.replace(",", "").strip()
        import re
        m = re.match(r"^([\d.]+)\s*(万|w|W|亿|e|E)?", s)
        if m:
            n = float(m.group(1)) or 0
            if m.group(2):
                if m.group(2) == "万" or m.group(2).lower() == "w":
                    n *= 1e4
                elif m.group(2) == "亿" or m.group(2).lower() == "e":
                    n *= 1e8
            return int(n)
    return 0


def normalize_items(json_body):
    arr = None
    if isinstance(json_body, dict):
        arr = json_body.get("data") or json_body.get("result") or json_body.get("list")
    if isinstance(json_body, list):
        arr = json_body
    if not isinstance(arr, list):
        return []
    out = []
    for it in arr:
        if not isinstance(it, dict):
            continue
        title = it.get("title") or it.get("word") or it.get("name") or it.get("query") or it.get("topic")
        if not title or not isinstance(title, str):
            continue
        out.append({
            "title": title.strip(),
            "hot": parse_hot(it.get("hot", it.get("num", it.get("heat", it.get("score", it.get("hot_value", it.get("hotValue"))))))),
            "url": it.get("url") or it.get("link") or "",
        })
    return out


def fetch_platform(aliases, label):
    for ptype in aliases:
        try:
            with httpx.Client(timeout=8.0, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}) as c:
                r = c.get(HOT_BASE, params={"type": ptype})
                if r.status_code != 200:
                    raise RuntimeError(f"HTTP {r.status_code}")
                items = normalize_items(r.json())
                if items:
                    logger.info(f"热榜[{label}/{ptype}] 拉到 {len(items)} 条")
                    for it in items:
                        it["platform"] = label
                    return items
        except Exception as e:
            logger.warning(f"热榜[{label}/{ptype}] 失败: {e}")
    return []


def fetch_all_hot():
    items = []
    for aliases, label in PLATFORMS:
        items.extend(fetch_platform(aliases, label))
    return items


def match_topic(title, topics):
    if not topics:
        return None
    low = title.lower()
    for t in topics:
        if t.lower() in low:
            return t
    return None


def dedupe_contents(db: Session, contents):
    existing = {
        row.content
        for row in db.query(DailyQuote.content).filter(DailyQuote.content.in_(contents)).all()
    }
    return [c for c in contents if c not in existing]


def cleanup_expired(db: Session, ttl_days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
    deleted = db.query(DailyQuote).filter(DailyQuote.fetched_at < cutoff).delete()
    db.commit()
    logger.info(f"清理过期: 删除 {deleted} 条 (TTL={ttl_days}天)")


def run_crawl(db: Session) -> dict:
    daily_limit = get_daily_limit(db)
    ttl_days = get_ttl_days(db)
    topics = get_crawl_topics(db)
    start = time.time()
    logger.info(f"话题过滤词 {len(topics)} 个, 上限 {daily_limit}, TTL {ttl_days}天")

    all_items = fetch_all_hot()
    logger.info(f"真实热榜共拉到 {len(all_items)} 条")

    # 命中话题的优先并打标签，其余按热度排后补齐到上限
    matched, rest = [], []
    for it in all_items:
        hit = match_topic(it["title"], topics) if topics else None
        if hit:
            it["matchedTopic"] = hit
            matched.append(it)
        else:
            rest.append(it)
    rest.sort(key=lambda x: x.get("hot") or 0, reverse=True)
    ordered = matched + rest
    logger.info(f"命中话题 {len(matched)} 条")

    inserted = 0
    used_real = False
    now = datetime.now(timezone.utc)

    if ordered:
        fresh_titles = dedupe_contents(db, [m["title"] for m in ordered])
        to_insert = [m for m in ordered if m["title"] in fresh_titles][:daily_limit]
        for m in to_insert:
            mt = m.get("matchedTopic")
            try:
                db.add(DailyQuote(
                    content=m["title"],
                    source="hotlist",
                    source_topic=m["platform"],
                    keywords=json.dumps([mt] if mt else [], ensure_ascii=False),
                    intent_key=None,
                    like_count=m["hot"] or 0,
                    rank_score=round((m["hot"] or 0) * 0.0001 + (1 if mt else 0), 4),
                    fetched_at=now,
                ))
                inserted += 1
            except Exception as e:
                logger.warning(f"入库跳过: {e}")
        db.commit()
        used_real = True
        logger.info(f"真实热榜入库 {inserted} 条")
    else:
        logger.info("无真实命中，回退语料池")
        pool = load_pool()
        if pool:
            import random
            random.shuffle(pool)
            candidates = pool[:daily_limit]
            fresh = dedupe_contents(db, [c["content"] for c in candidates])
            for it in [c for c in candidates if c["content"] in fresh]:
                kws = it.get("keywords") or []
                try:
                    db.add(DailyQuote(
                        content=it["content"],
                        source="pool",
                        source_topic=it.get("source_topic", "嘴替精选"),
                        keywords=json.dumps(kws, ensure_ascii=False),
                        intent_key=it.get("intent_key"),
                        like_count=it.get("like_count", 0),
                        rank_score=round((it.get("like_count", 0) or 0) * 0.6 + len(kws) * 0.4, 4),
                        fetched_at=now,
                    ))
                    inserted += 1
                except Exception as e:
                    logger.warning(f"回退入库跳过: {e}")
            db.commit()

    cleanup_expired(db, ttl_days)
    elapsed = round(time.time() - start, 2)
    logger.info(f"完成: 入库 {inserted} (来源 {'hotlist' if used_real else 'pool'}, 耗时 {elapsed}s)")
    return {
        "source": "hotlist" if used_real else "pool_fallback",
        "hotPulled": len(all_items),
        "inserted": inserted,
        "elapsedMs": int(elapsed * 1000),
    }
