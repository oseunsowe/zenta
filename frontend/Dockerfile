# Multi-stage build producing Next.js standalone output.
# The UI is served same-origin (no NEXT_PUBLIC_API_BASE_URL) — Caddy proxies
# /api to the backend, so the browser only ever talks to one origin (no CORS).

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined at build time, not read at container startup —
# this has to be a build arg. Only affects the marketing page's canonical link,
# Open Graph image, and sitemap.xml; falls back to localhost if unset.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Run as the built-in non-root user.
USER node
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
