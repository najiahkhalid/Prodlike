# Sandbox image for the friday-deploy scenario. Build context = scenarios/friday-deploy
FROM prodlike/sandbox-base:node20

# Dependencies are installed at image build time: sandboxes run with no network (ADR-005).
COPY --chown=node:node template/package.json /workspace/package.json
RUN npm install --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node template/ /workspace/
# Hidden tests are NOT copied here; the API copies them in only at scoring time.

# Seed a git history so "git log" / "git show" tell the release-train story. Migration 042 arrives in
# the last commit; the API folds the attempt's variant of it into that commit (ADR-010).
RUN mv db/migrations/042_add_trip_index.sql /tmp/042_add_trip_index.sql \
 && git init -q -b main \
 && git add -A \
 && git -c user.name=ci-bot -c user.email=ci@ridemate.test commit -qm "release v5.1.9" \
 && git -c user.name=Sara -c user.email=sara@ridemate.test commit -q --allow-empty -m "fix(driver-app): retry location upload" \
 && cp /tmp/042_add_trip_index.sql db/migrations/042_add_trip_index.sql \
 && git add -A \
 && git -c user.name=Kamran -c user.email=kamran@ridemate.test commit -qm "db: add index for my-trips (migration 042)"
