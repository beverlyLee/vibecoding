from typing import Optional

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..config_store import (
    get_crawl_topics,
    set_crawl_topics,
    get_daily_limit,
    set_daily_limit,
    get_ttl_days,
    set_ttl_days,
    get_keyword_rules,
    set_keywords_for,
    get_crawl_config,
)

router = APIRouter()


class TopicsUpdate(BaseModel):
    topics: list[str]


class LimitUpdate(BaseModel):
    dailyQuoteLimit: int


class TTLUpdate(BaseModel):
    dailyQuoteTTLDays: int


class KeywordsUpdate(BaseModel):
    intentKey: str
    keywords: list[str]


@router.get("")
def get_config(db: Session = Depends(get_db)):
    return get_crawl_config(db)


@router.put("/topics")
def put_topics(body: TopicsUpdate, db: Session = Depends(get_db)):
    set_crawl_topics(db, body.topics)
    return {"ok": True, "topics": get_crawl_topics(db)}


@router.put("/limit")
def put_limit(body: LimitUpdate, db: Session = Depends(get_db)):
    set_daily_limit(db, body.dailyQuoteLimit)
    return {"ok": True, "dailyQuoteLimit": get_daily_limit(db)}


@router.put("/ttl")
def put_ttl(body: TTLUpdate, db: Session = Depends(get_db)):
    set_ttl_days(db, body.dailyQuoteTTLDays)
    return {"ok": True, "dailyQuoteTTLDays": get_ttl_days(db)}


@router.put("/keywords")
def put_keywords(body: KeywordsUpdate, db: Session = Depends(get_db)):
    set_keywords_for(db, body.intentKey, body.keywords)
    return {"ok": True, "rules": get_keyword_rules(db)}
