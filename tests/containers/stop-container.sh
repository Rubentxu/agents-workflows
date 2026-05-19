#!/bin/bash
# =============================================================================
# Stop agents-workflows test container
# =============================================================================
# Usage: 
#   just test:container:down
#   bash containers/stop-container.sh
# =============================================================================

set -e

CONTAINER_NAME="agents-workflows-tests"
WORKSPACE_VOLUME="agents-workflows-tests-data"

echo "=== Stopping agents-workflows test container ==="

# Stop and remove container
if podman ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping container ${CONTAINER_NAME}..."
    podman stop ${CONTAINER_NAME}
    podman rm ${CONTAINER_NAME}
    echo "✓ Container stopped and removed"
else
    echo "Container ${CONTAINER_NAME} is not running"
fi

# Ask about volume cleanup
if podman volume ls --filter "name=${WORKSPACE_VOLUME}" --format "{{.Name}}" | grep -q "^${WORKSPACE_VOLUME}$"; then
    echo ""
    echo "Volume ${WORKSPACE_VOLUME} still exists with test data."
    read -p "Delete it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        podman volume rm ${WORKSPACE_VOLUME}
        echo "✓ Volume deleted"
    else
        echo "Volume preserved at: podman volume inspect ${WORKSPACE_VOLUME}"
    fi
fi

echo ""
echo "=== Container stopped ==="
echo ""
echo "To start again:"
echo "  just test:container:up"
