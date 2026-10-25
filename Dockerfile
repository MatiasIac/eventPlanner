FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS base
COPY . .
RUN npm run build
EXPOSE 8888
CMD ["npm", "run", "start:docker"]

FROM dependencies AS browser-dependencies
RUN npx playwright install --with-deps chromium

FROM browser-dependencies AS test
COPY . .
RUN npm run build
CMD ["npm", "test"]
