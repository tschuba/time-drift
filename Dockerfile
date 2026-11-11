FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm prune --prod

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=80
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/public public
EXPOSE 80
CMD ["node", "dist/index.js"]
