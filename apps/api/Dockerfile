FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run db:generate && npm run build -w @tesla/api
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run start -w @tesla/api"]
