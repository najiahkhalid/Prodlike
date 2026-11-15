# Base image for every scenario sandbox (ADR-005).
# docker build -t prodlike/sandbox-base:node20 infra/sandbox-base
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Runs as the unprivileged "node" user that ships with the image (uid 1000).
RUN mkdir -p /workspace && chown node:node /workspace
USER node
WORKDIR /workspace
ENV NODE_ENV=development CI=true FORCE_COLOR=1

# Containers are started by the API with: --network none, --read-only (+ tmpfs /tmp),
# --cap-drop ALL, --security-opt no-new-privileges, memory/CPU/pids limits.
CMD ["sleep", "infinity"]
