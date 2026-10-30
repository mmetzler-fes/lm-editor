# lm-editor als Container: liefert die Webapp aus und reicht Aufträge an den
# worksheet-renderer weiter (tools/serve.mjs, RENDERER_URL) – siehe docker-compose.yaml.
FROM node:22-alpine

LABEL org.opencontainers.image.title="lm-editor" \
      org.opencontainers.image.source="https://github.com/mmetzler-fes/lm-editor" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

WORKDIR /app
COPY index.html manifest.webmanifest sw.js package.json LICENSE ./
COPY icons icons
COPY examples examples
COPY src src
COPY tools/serve.mjs tools/serve.mjs

USER node
ENV PORT=5180
EXPOSE 5180
# Im Container auf allen Adressen; nach außen gibt docker-compose.yaml nur localhost frei.
CMD ["node", "tools/serve.mjs", "--lan"]
