# Taraz server image: builds the web app and the server bundle, then runs them on a slim Node image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN bash scripts/build-server.sh

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 TARAZ_STATIC_DIR=/app/web-dist
RUN npm install --no-save --omit=dev pg@8.23.1 && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
COPY --from=build /app/web-dist ./web-dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-dist/main.mjs"]
