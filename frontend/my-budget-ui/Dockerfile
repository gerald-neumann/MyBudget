# Build from repository root:
#   docker build -f frontend/my-budget-ui/Dockerfile -t mybudget-ui .
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/my-budget-ui/package.json frontend/my-budget-ui/package-lock.json ./frontend/my-budget-ui/
WORKDIR /src/frontend/my-budget-ui
# Font Awesome Pro: pass at build time without ARG/ENV (avoids SecretsUsedInArgOrEnv).
# Example: docker build --secret id=fontawesome_npm_token,env=FONTAWESOME_PRO_TOKEN ...
RUN --mount=type=secret,id=fontawesome_npm_token \
    sh -eu -c 'if ! test -s /run/secrets/fontawesome_npm_token; then echo "Missing build secret fontawesome_npm_token (non-empty). Example: docker build --secret id=fontawesome_npm_token,env=FONTAWESOME_PRO_TOKEN ..." >&2; exit 1; fi; FA_TOKEN=$(cat /run/secrets/fontawesome_npm_token); printf "@fortawesome:registry=https://npm.fontawesome.com/\n//npm.fontawesome.com/:_authToken=%s\n" "$FA_TOKEN" > .npmrc && npm ci && rm -f .npmrc'
COPY frontend/my-budget-ui/ ./
# `npm run prebuild` calls scripts/sync-version.cjs which reads /src/VERSION; both must be in the image.
COPY scripts/ /src/scripts/
COPY VERSION /src/VERSION
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/frontend/my-budget-ui/dist/my-budget-ui/browser /usr/share/nginx/html
COPY frontend/my-budget-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
