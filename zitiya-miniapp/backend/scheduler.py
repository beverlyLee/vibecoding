"""APScheduler 定时调度 —— 每天 01:00 跑一次爬虫（当前已停用）"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from .crawler import run_crawl

logger = logging.getLogger(__name__)

# 是否启用每日定时爬虫。云函数侧（daily_crawler）已承担每日语录抓取，
# 后端这条定时任务暂时停用，置 False 即可；恢复时改回 True。
ENABLE_DAILY_SCHEDULE = False

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
    if ENABLE_DAILY_SCHEDULE:
        scheduler.add_job(
            _crawl_job,
            CronTrigger(hour=1, minute=0),  # 每天 01:00
            id="daily_crawler",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        logger.info("定时调度已启动 (每天 01:00 爬虫)")
    else:
        logger.info("定时调度已停用（ENABLE_DAILY_SCHEDULE=False），不注册每日爬虫任务")
    scheduler.start()
    return scheduler


def stop_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("定时调度已停止")
