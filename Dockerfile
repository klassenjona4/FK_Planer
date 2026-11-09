# FK-Planer – Container für den Betrieb (z. B. bei einem Hoster in der EU)
FROM node:22-alpine AS basis
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM basis AS abhaengigkeiten
COPY package.json package-lock.json ./
RUN npm ci

FROM abhaengigkeiten AS bau
COPY . .
RUN npm run build

# Werkzeug-Abbild für Migrationen, Demodaten und Löschfristen
FROM bau AS werkzeug
CMD ["npm", "run", "db:migrate"]

FROM basis AS betrieb
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=bau /app/.next/standalone ./
COPY --from=bau /app/.next/static ./.next/static
# pdfkit lädt Schriftdaten zur Laufzeit aus seinem Paketordner
COPY --from=bau /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=bau /app/assets ./assets
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
