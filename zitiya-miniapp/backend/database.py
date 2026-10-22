# SQLite 持久化 —— 单文件，换机器带走 backend/data/zuitiya.db 就行
import os
from pathlib import Path

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Index,
)
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "zuitiya.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class DailyQuote(Base):
    """每日爬取的语录（爬虫写，前端读）"""

    __tablename__ = "daily_quotes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(String(500), nullable=False, unique=True)
    source = Column(String(20), default="weibo")
    source_topic = Column(String(50))
    keywords = Column(String(500))  # JSON 数组字符串
    intent_key = Column(String(30), index=True)
    like_count = Column(Integer, default=0)
    rank_score = Column(Float, default=0.0)
    fetched_at = Column(DateTime, index=True)

    __table_args__ = (
        Index("ix_dq_fetched", "fetched_at"),
    )


class SceneConfigRow(Base):
    """全局配置（key-value）"""

    __tablename__ = "scene_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(50), unique=True, nullable=False)
    value = Column(String(2000), nullable=False)  # JSON 字符串


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
