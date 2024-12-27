FROM node:20.11.0-alpine

WORKDIR /usr/src/app

COPY dist/apps/affected/cli/main.cli.js ./

ENTRYPOINT ["node", "main.js"]
