#!/bin/bash
set -e

INTERVAL=1
TIMEOUT=60

# Wait for qdrant to be responsive
echo "Waiting for qdrant to start..."
current=0

while ! nc -z $QDRANT_HOST 6333; do
    sleep $INTERVAL
    current=$((current + INTERVAL))
    if [ $current -eq $TIMEOUT ]; then
        echo "Timeout: qdrant did not start within $TIMEOUT seconds"
        exit 1
    fi
done
echo "qdrant has started."

# Start analytics-service in the background
uvicorn src.__main__:app --host 0.0.0.0 --port $ANALYTICS_AI_SERVICE_PORT --loop uvloop --http httptools &

if [[ -n "$SHOULD_FORCE_DEPLOY" ]]; then

    # Wait for the server to be responsive
    echo "Waiting for analytics-service to start..."
    current=0

    while ! nc -z localhost $ANALYTICS_AI_SERVICE_PORT; do
        sleep $INTERVAL
        current=$((current + INTERVAL))
        if [ $current -eq $TIMEOUT ]; then
            echo "Timeout: analytics-service did not start within $TIMEOUT seconds"
            exit 1
        fi
    done
    echo "analytics-service has started."

    # Wait for analytics-ui to be responsive
    echo "Waiting for analytics-ui to start..."
    current=0

    while ! nc -z analytics-ui $ANALYTICS_UI_PORT && ! nc -z host.docker.internal $ANALYTICS_UI_PORT; do
        sleep $INTERVAL
        current=$((current + INTERVAL))
        if [ $current -eq $TIMEOUT ]; then
            echo "Timeout: analytics-ui did not start within $TIMEOUT seconds"
            exit 1
        fi
    done
    echo "analytics-ui has started."

    echo "Forcing deployment..."
    python -m src.force_deploy
fi

# Bring analytics-ai-service to the foreground
wait
