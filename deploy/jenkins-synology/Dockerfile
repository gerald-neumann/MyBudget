# Jenkins controller with Docker CLI (talks to Synology's engine via mounted /var/run/docker.sock).
ARG JENKINS_IMAGE=jenkins/jenkins:lts-jdk21
FROM ${JENKINS_IMAGE}

USER root

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git git-lfs ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Set automatically with BuildKit; default helps older engines on some NAS builds.
ARG TARGETARCH=amd64
ARG DOCKER_CLI_VERSION=27.4.1
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) DOCKER_ARCH=x86_64 ;; \
      arm64) DOCKER_ARCH=aarch64 ;; \
      *) echo "Unsupported TARGETARCH=$TARGETARCH (need amd64 or arm64 for static Docker CLI)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" \
      | tar -xz -C /tmp; \
    mv /tmp/docker/docker /usr/local/bin/docker; \
    rm -rf /tmp/docker

# Optional: match host `docker` group GID so you can drop `user: root` in compose (set DOCKER_GID in .env).
ARG DOCKER_GID=0
RUN if [ "$DOCKER_GID" != "0" ] && [ "$DOCKER_GID" != "" ]; then \
      groupadd -g "${DOCKER_GID}" hostdocker 2>/dev/null || true; \
      usermod -aG "${DOCKER_GID}" jenkins 2>/dev/null || true; \
    fi

USER jenkins
