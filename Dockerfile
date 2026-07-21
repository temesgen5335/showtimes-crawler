# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Puppeteer's bundled Chromium isn't used in the image (we install a system
# Chromium in the runtime stage), so skip the ~150MB download during install.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# System Chromium + the fonts/libs it needs. Using the distro package keeps
# the browser and its shared libraries in lockstep, which is more reliable in
# a slim image than Puppeteer's downloaded build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     chromium \
     fonts-liberation \
     ca-certificates \
     dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY package*.json ./

# Run as the unprivileged user that the node image already provides.
USER node

# dumb-init reaps the zombie processes that headless Chromium can leave behind.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
