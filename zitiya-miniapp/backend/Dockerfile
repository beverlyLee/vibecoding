# 嘴替鸭后端 —— 微信云托管镜像
# 构建: docker build -t zitiya-backend .
# 推送: docker tag zitiya-backend ccr.ccs.tencentyun.com/<仓库>/zitiya-backend:latest && docker push ...

FROM python:3.11-slim

WORKDIR /opt

# 系统依赖（lxml 需要 gcc）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 先拷依赖清单，利用 Docker 缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷代码
COPY main.py main.py
COPY database.py database.py
COPY config_store.py config_store.py
COPY crawler.py crawler.py
COPY daily_pool.json daily_pool.json
COPY scheduler.py scheduler.py
COPY routers routers

# 创建数据目录（云托管容器内重启会清空，见下方说明）
RUN mkdir -p data

# 端口和云托管保持一致
EXPOSE 8000

# 启动命令 —— 用 uvicorn 监听 0.0.0.0
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
