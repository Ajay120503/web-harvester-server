FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .
RUN mkdir -p uploads

# Build-time ARGs with defaults (overridden by docker-compose build args)
ARG PORT
ARG MONGO_URI
ARG JWT_SECRET
ARG SESSION_SECRET
ARG CORS_ORIGIN

# Runtime env will override these when passed via docker-compose environment
ENV PORT=${PORT:-5000}
ENV MONGO_URI=${MONGO_URI}
ENV JWT_SECRET=${JWT_SECRET}
ENV SESSION_SECRET=${SESSION_SECRET}
ENV CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:3000}
ENV NODE_ENV=production

EXPOSE ${PORT}
CMD ["node", "server.js"]