FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations
COPY sql ./sql
COPY scripts ./scripts

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
