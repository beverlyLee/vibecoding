"""微博话题爬虫 + 关键词过滤 + 综合排序"""
import re
import time
import json
import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from .database import DailyQuote
from .config_store import (
    get_crawl_topics,
    get_daily_limit,
    get_ttl_days,
    get_keyword_map,
)

logger = logging.getLogger(__name__)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def parse_count(s: str) -> int:
    """微博数字解析 '1.2万' → 12000, '2356' → 2356"""
    if not s:
        return 0
    s = str(s).strip()
    if "万" in s:
        return int(float(s.replace("万", "")) * 10000)
    if "亿" in s:
        return int(float(s.replace("亿", "")) * 100000000)
    m = re.search(r"\d+", s)
    return int(m.group()) if m else 0


def annotate(content: str, kw_map: dict[str, list[str]]) -> dict:
    """标注关键词 + 匹配度分数（和前端 annotateKeywords 同逻辑）"""
    matched: set[str] = set()
    best_key: Optional[str] = None
    best_hits = 0
    total_hits = 0

    for intent_key, keywords in kw_map.items():
        hits = 0
        for kw in keywords:
            if kw in content:
                matched.add(kw)
                hits += 1
                total_hits += 1
        if hits > best_hits:
            best_hits = hits
            best_key = intent_key

    return {
        "keywords": list(matched),
        "intent_key": best_key,
        "kw_score": min(total_hits, 10),
        "useful": len(matched) > 0,
    }


def score_and_sort(items: list[dict]) -> list[dict]:
    """综合排序：点赞 × 0.6 + 关键词匹配度 × 0.4"""
    if not items:
        return items
    max_likes = max((it.get("like_count", 0) for it in items), default=1) or 1
    max_kw = 10

    for it in items:
        like_norm = (it.get("like_count", 0) or 0) / max_likes
        kw_norm = (it.get("kw_score", 0) or 0) / max_kw
        it["rank_score"] = round(like_norm * 0.6 + kw_norm * 0.4, 4)

    items.sort(key=lambda x: x.get("rank_score", 0), reverse=True)
    return items


def crawl_weibo_topic(topic: str, client: httpx.Client) -> list[dict]:
    """爬一个微博话题页，返回 [{content, like_count, source_topic}]"""
    url = f"https://s.weibo.com/weibo?q={urllib.parse.quote(topic)}&typeall=1&suball=1&timescope=custom:1:0"
    try:
        resp = client.get(url, timeout=10.0)
        if resp.status_code != 200:
            logger.warning(f"话题「{topic}」HTTP {resp.status_code}")
            return []
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        logger.warning(f"话题「{topic}」请求失败: {e}")
        return []

    items = []
    # 微博话题页：每个卡片 class="card-main" 里有 p.txt 和 action-type="feed_list_like"
    for card in soup.select("div.card-main"):
        txt_el = card.select_one("p.txt")
        if not txt_el:
            continue
        clean = txt_el.get_text(" ", strip=True)
        clean = re.sub(r"\s+", " ", clean)
        if not (10 <= len(clean) <= 200):
            continue

        # 点赞数
        like_count = 0
        like_el = card.select_one('a[action-type="feed_list_like"]')
        if like_el:
            num_match = re.search(r"[\d.]+[万亿]?", like_el.get_text())
            if num_match:
                like_count = parse_count(num_match.group())

        items.append({
            "content": clean,
            "like_count": like_count,
            "source": "weibo",
            "source_topic": topic,
        })

    logger.info(f"话题「{topic}」提取 {len(items)} 条")
    return items


def dedupe_and_filter(db: Session, new_items: list[dict]) -> list[dict]:
    """按 content 去重（查库里已有），过滤掉重复的"""
    if not new_items:
        return []
    contents = [it["content"] for it in new_items]
    existing = {
        row.content
        for row in db.query(DailyQuote.content)
        .filter(DailyQuote.content.in_(contents))
        .all()
    }
    return [it for it in new_items if it["content"] not in existing]


def cleanup_expired(db: Session, ttl_days: int):
    """清理 fetched_at < ttl_days 天前的旧条目"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
    deleted = db.query(DailyQuote).filter(DailyQuote.fetched_at < cutoff).delete()
    db.commit()
    logger.info(f"清理过期: 删除 {deleted} 条 (TTL={ttl_days}天)")


def run_crawl(db: Session) -> dict:
    """一次完整爬取：爬 → 标注 → 排序 → 去重 → 入库 → 清理"""
    topics = get_crawl_topics(db)
    kw_map = get_keyword_map(db)
    daily_limit = get_daily_limit(db)
    ttl_days = get_ttl_days(db)

    logger.info(f"开始爬取: {len(topics)} 个话题, Top {daily_limit}, TTL {ttl_days}天")
    start = time.time()

    # 1. 爬取
    all_raw: list[dict] = []
    headers = {"User-Agent": UA}
    with httpx.Client(headers=headers, follow_redirects=True) as client:
        for topic in topics:
            all_raw.extend(crawl_weibo_topic(topic, client))
            time.sleep(0.5)  # 礼貌间隔

    logger.info(f"原始爬取: {len(all_raw)} 条")

    if not all_raw:
        return {"rawFetched": 0, "inserted": 0, "message": "爬取为空"}

    # 2. 关键词过滤
    annotated = []
    for item in all_raw:
        ann = annotate(item["content"], kw_map)
        if ann["useful"]:
            annotated.append({**item, **ann})

    logger.info(f"关键词过滤后: {len(annotated)} 条")

    if not annotated:
        return {"rawFetched": len(all_raw), "inserted": 0, "message": "无关键词命中"}

    # 3. 综合排序取 Top N
    sorted_items = score_and_sort(annotated)
    top_n = sorted_items[:daily_limit]
    logger.info(f"排序取 Top {len(top_n)} / {len(sorted_items)}")

    # 4. 去重
    fresh = dedupe_and_filter(db, top_n)

    # 5. 入库
    inserted = 0
    now = datetime.now(timezone.utc)
    for it in fresh:
        try:
            db.add(DailyQuote(
                content=it["content"],
                source=it.get("source", "weibo"),
                source_topic=it.get("source_topic"),
                keywords=json.dumps(it["keywords"], ensure_ascii=False),
                intent_key=it.get("intent_key"),
                like_count=it.get("like_count", 0),
                rank_score=it.get("rank_score", 0.0),
                fetched_at=now,
            ))
            inserted += 1
        except Exception as e:
            logger.warning(f"入库跳过: {e}")
    db.commit()

    # 6. 清理过期
    cleanup_expired(db, ttl_days)

    elapsed = round(time.time() - start, 2)
    logger.info(f"完成: 原始 {len(all_raw)} → 入库 {inserted} (耗时 {elapsed}s)")

    return {
        "rawFetched": len(all_raw),
        "afterAnnotate": len(annotated),
        "sortedTop": len(top_n),
        "inserted": inserted,
        "elapsedMs": int(elapsed * 1000),
    }
