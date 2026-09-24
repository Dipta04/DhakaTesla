FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY . .
ENV API_INTERNAL_URL=http://api:4000
RUN npm run build -w @tesla/web
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@tesla/web"]
