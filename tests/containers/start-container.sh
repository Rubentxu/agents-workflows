#!/bin/bash
# =============================================================================
# Start agents-workflows test container
# =============================================================================
# Usage: 
#   just test:container:up
#   bash containers/start-container.sh
# =============================================================================

set -e

CONTAINER_NAME="agents-workflows-tests"
IMAGE_NAME="localhost/agents-workflows:latest"
WORKSPACE_VOLUME="agents-workflows-tests-data"

echo "=== Starting agents-workflows test container ==="

# Check if container already exists and is running
if podman ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "✓ Container ${CONTAINER_NAME} is already running"
    exit 0
fi

# Stop any existing container with same name
if podman ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Removing existing container..."
    podman stop ${CONTAINER_NAME} 2>/dev/null || true
    podman rm ${CONTAINER_NAME} 2>/dev/null || true
fi

# Create volume if it doesn't exist
if ! podman volume ls --filter "name=${WORKSPACE_VOLUME}" --format "{{.Name}}" | grep -q "^${WORKSPACE_VOLUME}$"; then
    echo "Creating volume ${WORKSPACE_VOLUME}..."
    podman volume create ${WORKSPACE_VOLUME}
fi

# Pull/build image if not present
if ! podman images --filter "reference=${IMAGE_NAME}" --format "{{.Repository}}"; then
    echo "Image ${IMAGE_NAME} not found. Building..."
    cd "$(dirname "$0")/.."
    podman build -t ${IMAGE_NAME} .
fi

# Start container
echo "Starting container ${CONTAINER_NAME}..."
podman run -d \
    --name ${CONTAINER_NAME} \
    -p 8080:8080 \
    -p 8081:8081 \
    -v ${WORKSPACE_VOLUME}:/home/appuser/.workflows \
    -e WORKSPACE=/home/appuser/.workflows \
    -e RUST_LOG=info \
    ${IMAGE_NAME}

echo "✓ Container started"

# Wait for service to be healthy
echo "Waiting for service to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0

until curl -sf http://localhost:8081/health > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "✗ Service failed to become healthy after ${MAX_RETRIES} attempts"
        echo "Container logs:"
        podman logs ${CONTAINER_NAME} | tail -20
        exit 1
    fi
    sleep 1
done

echo "✓ Service is healthy"
echo ""
echo "=== Container ready ==="
echo "  Studio UI:  http://localhost:8080/studio"
echo "  MCP:        http://localhost:8080/mcp"
echo "  REST API:   http://localhost:8081/api"
echo "  Health:     http://localhost:8081/health"
echo ""
echo "Logs: podman logs -f ${CONTAINER_NAME}"
echo "Stop: just test:container:down"
