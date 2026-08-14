FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/tmp

RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# No ejecutar como root (seguridad)
RUN mkdir -p /app/uploads \
 && chown -R node:node /app/uploads /app/node_modules/@prisma /app/node_modules/.prisma
USER node

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
