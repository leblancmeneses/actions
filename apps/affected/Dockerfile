FROM node:23.5.0-alpine3.21

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app && \
    apk add --no-cache git

WORKDIR /usr/src/app

COPY dist/apps/affected/cli/main.cli.js ./
RUN chmod +x main.cli.js

USER appuser

ENTRYPOINT ["node", "/usr/src/app/main.cli.js"]
