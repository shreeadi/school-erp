# syntax=docker/dockerfile:1.7
# Build context: repository root.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @school-erp/api...
COPY apps/api apps/api
RUN pnpm --filter @school-erp/api build
RUN pnpm deploy --filter @school-erp/api --prod --legacy /out \
 && rm -rf /out/src /out/test /out/tsconfig*.json /out/Dockerfile \
 && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts /out/

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/src/main.js"]
