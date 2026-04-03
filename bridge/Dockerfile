FROM node:20-bookworm

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./
ENV NODE_ENV=production

CMD ["node", "index.js"]
