# Sandbox image for the free-delivery scenario. Build context = scenarios/free-delivery
FROM prodlike/sandbox-base:node20

# Dependencies are installed at image build time: sandboxes run with no network (ADR-005).
COPY --chown=node:node template/package.json /workspace/package.json
RUN npm install --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node template/ /workspace/
# Hidden tests are NOT copied here; the API copies them in only at scoring time.
# Seed a git history so "git log" / "git show" tell the release-train story. The last commit is the
# cache change; the API folds the attempt's variant of deploy/cache.env into it (ADR-010).
RUN cp deploy/cache.env /tmp/cache.env \
 && sed -i -e 's/{{BAD_TTL}}/300/' -e '/changed in/d' deploy/cache.env \
 && git init -q -b main \
 && git add -A \
 && git -c user.name=ci-bot -c user.email=ci@kitaab.test commit -qm "release v2.3.0" \
 && git -c user.name=Hira -c user.email=hira@kitaab.test commit -q --allow-empty -m "feat(search): tolerate one-letter typos" \
 && cp /tmp/cache.env deploy/cache.env \
 && git add -A \
 && git -c user.name=Faraz -c user.email=faraz@kitaab.test commit -qm "perf(cache): shorten catalogue cache"
