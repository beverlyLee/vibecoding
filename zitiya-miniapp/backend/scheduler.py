"""APScheduler 定时调度 —— 每天 01:00 跑一次爬虫"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from .crawler import run_crawl

logger = logging.getLogger(__name__)

scheduler: BackgroundScheduler | None = None


def _crawl_job():
    logger.info("定时爬虫触发 @ %s", datetime.now(timezone.utc).isoformat())
    db = SessionLocal()
    try:
        run_crawl(db)
    except Exception:
        logger.exception("定时爬虫失败")
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    global scheduler
    if scheduler and scheduler.running:
        return scheduler

    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(
        _crawl_job,
        CronTrigger(hour=1, minute=0),  # 每天 01:00
        id="daily_crawler",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info("定时调度已启动 (每天 01:00 爬虫)")
    return scheduler


def stop_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("定时调度已停止")
