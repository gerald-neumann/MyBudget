# Build from repository root:
#   docker build -f frontend/my-budget-ui/Dockerfile -t mybudget-ui .
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/my-budget-ui/package.json frontend/my-budget-ui/package-lock.json ./frontend/my-budget-ui/
WORKDIR /src/frontend/my-budget-ui
RUN npm ci
COPY frontend/my-budget-ui/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/frontend/my-budget-ui/dist/my-budget-ui/browser /usr/share/nginx/html
COPY frontend/my-budget-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
