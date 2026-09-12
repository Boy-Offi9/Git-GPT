FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Fail early with a clear message if the checkout is wrong.
RUN ls -la && test -d app || (echo "FATAL: app/ directory missing in build context" && exit 1)

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
CMD ["npm", "run", "start"]
