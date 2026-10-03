# ---------- Etapa 1: compilación Angular ----------
FROM node:22-alpine AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx ng build --configuration production

# ---------- Etapa 2: servidor web (Nginx) ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/patopan-web/browser /usr/share/nginx/html
EXPOSE 80
