# AuditGym offline check: python:3.11, no network needed at run time, no GPU.
#   docker build -t auditgym .
#   docker run --rm --network none --cpus 2 --memory 4g auditgym
FROM python:3.11.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt

COPY auditgym ./auditgym
COPY configs ./configs
COPY tests ./tests
COPY episodes ./episodes

# The check runs as an unprivileged user; it writes only to /app/results.
RUN useradd --create-home --uid 10001 audit && mkdir -p /app/results && chown -R audit /app/results
USER audit

CMD ["python", "-m", "auditgym", "check", "--out", "/app/results"]
