FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m lab && mkdir -p /data && chown lab:lab /data
USER lab
ENV DATABASE_URL=sqlite:////data/agent_lab.db
CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
