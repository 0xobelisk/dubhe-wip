FROM rust:1.85-bookworm AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    clang \
    cmake \
    git \
    libprotobuf-dev \
    libssl-dev \
    pkg-config \
    protobuf-compiler \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cargo build --release -p dubhe-channel

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/dubhe-channel /usr/local/bin/dubhe-channel

EXPOSE 8080

ENTRYPOINT ["dubhe-channel"]
