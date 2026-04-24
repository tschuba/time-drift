# Stage 1: Build
FROM rust:bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/time-drift /usr/local/bin/
COPY --from=builder /app/static /app/static
COPY --from=builder /app/migrations /app/migrations
WORKDIR /app
EXPOSE 80
CMD ["time-drift"]
