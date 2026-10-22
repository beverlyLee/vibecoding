from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..crawler import run_crawl

router = APIRouter()


@router.post("/run")
def trigger_crawl(db: Session = Depends(get_db)):
    """手动触发一次爬取（测试用 / 管理后台点）"""
    return run_crawl(db)


@router.get("/status")
def crawl_status(db: Session = Depends(get_db)):
    """看当前爬虫参数"""
    from ..config_store import get_crawl_config
    return get_crawl_config(db)
