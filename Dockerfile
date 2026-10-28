FROM node:24-bookworm-slim AS base

# Prisma Migrate's schema engine requires OpenSSL in the slim development image.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# With install scripts disabled, pnpm's native-binary placeholder has no shebang.
# Use its official Node.js launcher so direct docker exec commands also work.
RUN npm install --global --ignore-scripts pnpm@12.14.0 \
    && chmod +x /usr/local/lib/node_modules/pnpm/bin/pnpm.mjs \
    && ln --symbolic --force /usr/local/lib/node_modules/pnpm/bin/pnpm.mjs /usr/local/bin/pnpm \
    && chown node:node /app
USER node

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
COPY --chown=node:node . .
RUN pnpm db:generate
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM development AS build
RUN pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/views ./views
COPY --from=build /app/public ./public
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
