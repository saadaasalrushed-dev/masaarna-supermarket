# Node 20 (bookworm): reliable builds for sqlite3 + sharp native modules.
FROM node:20-bookworm
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
COPY frontend ./frontend
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
