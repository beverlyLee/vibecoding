"""全局配置读写（存 SQLite scene_config 表，key-value）"""
import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from .database import SceneConfigRow


DEFAULT_CRAWL_TOPICS = [
    "接话技巧", "高情商说话", "回话的技术", "怎么拒绝", "拒绝别人",
    "说话的艺术", "沟通技巧", "不尴尬拒绝", "怼人技巧", "怎么回怼", "嘴替",
]

DEFAULT_KEYWORD_RULES = [
    {"key": "marriage", "keywords": ["结婚", "找对象", "谈恋爱", "催婚", "要孩子", "生娃", "生孩子", "二胎", "相亲", "另一半", "彩礼"]},
    {"key": "privacy", "keywords": ["工资", "挣多少", "赚多少", "月薪", "年薪", "买房", "买车", "存款", "年终奖", "多少钱", "房价", "考了多少分"]},
    {"key": "compare", "keywords": ["你看人家", "别人家", "比不上", "不如", "差远了", "没出息", "白养", "人家孩子", "怎么就不如", "丢人"]},
    {"key": "pua_draw", "keywords": ["多学习", "吃苦", "锻炼你", "培养你", "大饼", "以后给你", "年轻人要", "为公司", "奉献", "狼性", "格局", "情怀", "加班"]},
    {"key": "pua_suppress", "keywords": ["不行", "太差", "能力不够", "离了平台", "你算什么", "换个地方", "没人要你", "白干了这么多年", "笨", "你就是"]},
    {"key": "blame", "keywords": ["你的责任", "你怎么搞的", "都怪你", "你的问题", "因为你们", "就是你的", "你负责的", "你是干什么的"]},
    {"key": "moral", "keywords": ["为你好", "我是你妈", "我是你爸", "长辈", "不孝", "白眼狼", "都是因为你", "养你这么大", "当哥的", "一家人", "别不识好歹"]},
    {"key": "drink", "keywords": ["喝酒", "不喝", "感情深", "一口闷", "给面子", "不喝就是", "干了", "走一个", "喝一个", "酒品", "意思一下"]},
    {"key": "joke", "keywords": ["开玩笑", "开个玩笑", "幽默", "这么开不起", "胖了", "丑", "秃", "单身狗", "取笑", "损你", "你还当真"]},
    {"key": "control", "keywords": ["你必须", "听我的", "不许", "就听我的没错", "我说了算", "赶紧去", "要求你", "你得给我", "给我做", "给我改", "给我写"]},
    {"key": "borrow", "keywords": ["借点", "借我", "周转", "手头紧", "救急", "借个钱", "宽限", "还钱", "欠我的"]},
    {"key": "guilt_trip", "keywords": ["我都是为你好", "都是为你好", "我容易吗", "我付出了多少", "我对你这么好", "我牺牲了", "我忍了", "你对得起", "你良心", "我心都碎了", "我心寒", "哭给你看", "你知不知道我"]},
    {"key": "service_conflict", "keywords": ["投诉", "我要退款", "退货", "差评", "12315", "消协", "欺骗", "假货", "质量问题", "维权", "找你们领导", "不给解决"]},
    {"key": "reject_invite", "keywords": ["晚上有空吗", "周末有空吗", "一起吃饭", "出来玩", "约你", "要不要来", "来吧", "一定要来", "别不去", "就差你", "下次一定"]},
]

DEFAULT_DAILY_LIMIT = 100
DEFAULT_TTL_DAYS = 7


def _get(db: Session, key: str) -> Optional[str]:
    row = db.query(SceneConfigRow).filter(SceneConfigRow.key == key).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str):
    row = db.query(SceneConfigRow).filter(SceneConfigRow.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SceneConfigRow(key=key, value=value))
    db.commit()


# ---- 爬虫参数 ----

def get_crawl_topics(db: Session) -> list[str]:
    raw = _get(db, "crawlTopics")
    if raw:
        return json.loads(raw)
    return list(DEFAULT_CRAWL_TOPICS)


def set_crawl_topics(db: Session, topics: list[str]):
    _set(db, "crawlTopics", json.dumps(topics, ensure_ascii=False))


def get_daily_limit(db: Session) -> int:
    raw = _get(db, "dailyQuoteLimit")
    return int(raw) if raw else DEFAULT_DAILY_LIMIT


def set_daily_limit(db: Session, n: int):
    n = max(1, min(500, n))
    _set(db, "dailyQuoteLimit", str(n))


def get_ttl_days(db: Session) -> int:
    raw = _get(db, "dailyQuoteTTLDays")
    return int(raw) if raw else DEFAULT_TTL_DAYS


def set_ttl_days(db: Session, d: int):
    d = max(1, min(30, d))
    _set(db, "dailyQuoteTTLDays", str(d))


# ---- 关键词规则 ----

def get_keyword_rules(db: Session) -> list[dict]:
    """返回完整规则列表（默认 + 覆盖）"""
    overrides_raw = _get(db, "keywordOverrides")
    overrides: dict = json.loads(overrides_raw) if overrides_raw else {}
    result = []
    for r in DEFAULT_KEYWORD_RULES:
        result.append({
            "key": r["key"],
            "keywords": overrides.get(r["key"], r["keywords"]),
        })
    return result


def get_keyword_map(db: Session) -> dict[str, list[str]]:
    return {r["key"]: r["keywords"] for r in get_keyword_rules(db)}


def set_keywords_for(db: Session, intent_key: str, keywords: list[str]):
    overrides_raw = _get(db, "keywordOverrides")
    overrides: dict = json.loads(overrides_raw) if overrides_raw else {}
    overrides[intent_key] = keywords
    _set(db, "keywordOverrides", json.dumps(overrides, ensure_ascii=False))


# ---- 综合配置快照 ----

def get_crawl_config(db: Session) -> dict[str, Any]:
    return {
        "crawlTopics": get_crawl_topics(db),
        "dailyQuoteLimit": get_daily_limit(db),
        "dailyQuoteTTLDays": get_ttl_days(db),
        "keywordRules": get_keyword_rules(db),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }
