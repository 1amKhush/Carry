FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@10.34.5
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

# Keep workspace source outside node_modules: Node 24 does not strip TypeScript
# in installed packages. Workspace links resolve to these source directories.
FROM node:24-bookworm-slim AS dependencies
RUN npm install --global pnpm@10.34.5
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/crypto/package.json packages/crypto/package.json
RUN pnpm install --prod --frozen-lockfile --filter @carry/api...

FROM node:24-bookworm-slim
ENV NODE_ENV=production CARRY_API_HOST=0.0.0.0 CARRY_API_PORT=3001 CARRY_SERVE_WEB=1 CARRY_DB_PATH=/data/carry.sqlite
WORKDIR /app/apps/api
COPY --from=dependencies --chown=node:node /app/ /app/
COPY --from=build --chown=node:node /workspace/apps/api/src/ /app/apps/api/src/
COPY --from=build --chown=node:node /workspace/packages/protocol/src/ /app/packages/protocol/src/
COPY --from=build --chown=node:node /workspace/packages/crypto/src/ /app/packages/crypto/src/
COPY --from=build --chown=node:node /workspace/apps/web/dist/ /app/apps/web/dist/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.ts"]
