# Sandbox image for the discount-bug scenario. Build context = scenarios/discount-bug
# docker build -f image/Dockerfile -t prodlike/scenario-discount-bug:1 .
FROM prodlike/sandbox-base:node20

# Dependencies are installed at image build time: sandboxes run with no network (ADR-005).
COPY --chown=node:node template/package.json /workspace/package.json
RUN npm install --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node template/ /workspace/
# Hidden tests are NOT copied here; the API copies them in only at scoring time.

# Seed a git history so "git log" / "git diff" tell the release-train story. The last commit is the
# timeout change; the API folds the attempt's variant of deploy/payments.env into it (ADR-010).
RUN cp deploy/payments.env /tmp/payments.env \
 && sed -i -e 's/{{BAD_TIMEOUT_MS}}/5000/' -e '/changed in/d' deploy/payments.env \
 && git init -q -b main \
 && git add -A \
 && git -c user.name=ci-bot -c user.email=ci@bytebite.test commit -qm "release v1.4.1" \
 && git -c user.name=Sana -c user.email=sana@bytebite.test commit -q --allow-empty -m "feat(cart): show savings line" \
 && cp /tmp/payments.env deploy/payments.env \
 && git add -A \
 && git -c user.name=Usman -c user.email=usman@bytebite.test commit -qm "chore(payments): tune timeout"
