FROM node:23-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

FROM node:23-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:23-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
