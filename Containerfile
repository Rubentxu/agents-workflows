# =============================================================================
# Multi-stage Containerfile for agents-workflows
# =============================================================================
# Build:  podman build -t agents-workflows:latest .
# Run:    podman run -d --name agents-workflows -p 8080:8080 -p 8081:8081 \
#           -v agents-workflows-data:/data \
#           --restart=always agents-workflows:latest
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM docker.io/library/rust:1.88-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libsqlite3-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy source code
COPY . .

# Build the binary (without embedded-studio, we copy studio files directly)
RUN cargo build --release -p mcp-server

# -----------------------------------------------------------------------------
# Stage 2: Runtime
# -----------------------------------------------------------------------------
FROM docker.io/library/debian:bookworm-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    sqlite3 \
    libsqlite3-0 \
    libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN useradd -m -s /bin/bash appuser && \
    mkdir -p /home/appuser/.workflows && \
    chown -R appuser:appuser /home/appuser

# Copy binary from builder
COPY --from=builder /build/target/release/workflow-mcp /usr/local/bin/

# Copy default workflow templates
COPY --from=builder /build/crates/mcp-server/templates /home/appuser/.workflows/templates

# Copy studio UI files
COPY --from=builder /build/studio/dist /home/appuser/.workflows/studio

# Fix ownership for all workflow data (templates and studio)
RUN chown -R appuser:appuser /home/appuser/.workflows

# Environment defaults
ENV WORKSPACE=/home/appuser/.workflows
ENV RUST_LOG=info
ENV PORT=8080
ENV REST_PORT=8081

# Expose ports
EXPOSE 8080 8081

# Volume for persistent data
VOLUME ["/home/appuser/.workflows"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Run the server
ENTRYPOINT ["workflow-mcp", "start"]
CMD ["--workspace", "/home/appuser/.workflows", "--port", "8080"]
