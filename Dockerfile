FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --disable-pip-version-check -r requirements.txt \
    && useradd --create-home --uid 10001 neurocanvas

COPY backend/ /app/
RUN chown -R neurocanvas:neurocanvas /app
USER neurocanvas

EXPOSE 8000
# One worker is intentional: ephemeral sessions are process-local.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 16 --timeout-keep-alive 5"]
