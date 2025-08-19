FROM node:20-alpine

# App directory
WORKDIR /usr/src/app

# Install dependencies first (use lockfile if present)
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source
COPY public ./public
COPY server.js ./server.js

# The app listens on PORT (defaults to 3000)
EXPOSE 3000

CMD ["npm", "start"]


