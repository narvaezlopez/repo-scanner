# syntax=docker/dockerfile:1

# --- build ---
FROM node:24.15.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime ---
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web-ui-repo-scanner/browser /usr/share/nginx/html
EXPOSE 8080
