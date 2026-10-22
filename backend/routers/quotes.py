from datetime import datetime, timezone
import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import DailyQuote, get_db

router = APIRouter()


@router.get("")
def list_quotes(
    intent_key: Optional[str] = Query(None, description="按意图过滤"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """拉取每日语录（按 rank_score 降序）"""
    q = db.query(DailyQuote)
    if intent_key:
        q = q.filter(DailyQuote.intent_key == intent_key)
    rows = (
        q.order_by(DailyQuote.rank_score.desc(), DailyQuote.fetched_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "content": r.content,
            "source": r.source,
            "source_topic": r.source_topic,
            "keywords": json.loads(r.keywords) if r.keywords else [],
            "intent_key": r.intent_key,
            "like_count": r.like_count,
            "rank_score": r.rank_score,
            "fetched_at": r.fetched_at.isoformat() if r.fetched_at else None,
        }
        for r in rows
    ]


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    """看库里目前有多少条、最近一次爬取时间"""
    total = db.query(DailyQuote).count()
    latest = (
        db.query(DailyQuote.fetched_at)
        .order_by(DailyQuote.fetched_at.desc())
        .first()
    )
    by_intent = (
        db.query(DailyQuote.intent_key, __import__("sqlalchemy").func.count())
        .filter(DailyQuote.intent_key.isnot(None))
        .group_by(DailyQuote.intent_key)
        .all()
    )
    return {
        "total": total,
        "latestFetched": latest[0].isoformat() if latest and latest[0] else None,
        "byIntent": {k: v for k, v in by_intent},
    }
