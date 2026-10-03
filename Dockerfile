# Self-hosted image (TD-17 Opsi B). Not used by managed hosting (Opsi A).
# Secrets are provided at runtime via environment variables — never baked into the image.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build

# Operational tools: migrations, admin CLI, preflight, go-live check, reconciliation.
#   docker run --rm --env-file .env.production enjua-cake:tools npm run db:migrate
FROM deps AS tools
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# Static files (hero photos in public/images/hero); standalone output does not include public/.
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
