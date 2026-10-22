# 嘴替鸭后端 —— FastAPI + SQLite + APScheduler
# 启动: uvicorn backend.main:app --reload --port 8080
# 文档: http://localhost:8080/docs

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .scheduler import start_scheduler, stop_scheduler
from .routers import quotes, crawl, config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化 DB + 启动定时调度
    init_db()
    scheduler = start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title="嘴替鸭后端", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quotes.router, prefix="/api/quotes", tags=["语录"])
app.include_router(crawl.router, prefix="/api/crawl", tags=["爬虫"])
app.include_router(config.router, prefix="/api/config", tags=["配置"])


@app.get("/")
def root():
    return {"service": "嘴替鸭后端", "docs": "/docs", "db": str(Path("backend/data").resolve())}
