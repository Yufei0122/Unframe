FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && python -m venv /opt/venv
# Build-time weight verification uses two threads; runtime limits are set below.
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHON_EXE=/opt/venv/bin/python \
    PYTHONDONTWRITEBYTECODE=1 \
    OPENCLIP_CACHE_DIR=/opt/models \
    OPENCLIP_DEVICE=cpu \
    OPENCLIP_THREADS=2 \
    OPENCLIP_TIMEOUT_MS=30000 \
    AI_PROVIDER=bedrock \
    VECTOR_STORE=s3vectors \
    AWS_REGION=ap-southeast-2
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY local-ai/requirements.txt local-ai/requirements.txt
RUN pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r local-ai/requirements.txt
COPY local-ai/model.py local-ai/download.py local-ai/server.py local-ai/image_input.py local-ai/
# Public weights are downloaded at build time, never from a developer's .venv/cache.
RUN python local-ai/download.py
COPY server/ server/
COPY shared/ shared/
COPY worker/ worker/
RUN useradd --create-home --uid 10001 unframe && chown -R unframe:unframe /opt/models /app
USER unframe
# University Fargate limit: 0.5 vCPU / 2048 MiB. Avoid competing BLAS/OpenMP
# thread pools and excess glibc arenas; keep the same FP32 model and weights.
ENV HF_HUB_OFFLINE=1 \
    OPENCLIP_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 CMD ["node", "worker/healthcheck.js"]
CMD ["node", "worker/start.js"]
