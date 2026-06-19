FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .
RUN mkdir -p uploads

# Build-time ARGs (infrastructure config only, not secrets)
ARG PORT
ARG CORS_ORIGIN

# Runtime env (from docker-compose env_file or environment) overrides these
ENV PORT=${PORT:-5000}
ENV CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:3000}
ENV NODE_ENV=production

EXPOSE ${PORT}
CMD ["node", "server.js"]
