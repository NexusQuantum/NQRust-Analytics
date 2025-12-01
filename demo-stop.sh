#!/bin/bash

# Nexus Analytics Demo Stop Script
# Gracefully stops all demo services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Stopping Nexus Analytics Demo...${NC}"

if [ ! -f "docker-compose-demo.yaml" ]; then
    echo -e "${RED}❌ docker-compose-demo.yaml not found${NC}"
    exit 1
fi

echo -e "${YELLOW}⏳ Stopping services...${NC}"
docker compose -f docker-compose-demo.yaml down

echo -e "${BLUE}🧹 Cleaning up...${NC}"
docker system prune -f --volumes

echo -e "${GREEN}✅ Demo stopped successfully!${NC}"
echo ""
echo -e "${BLUE}💡 To start demo again, run: ./demo-start.sh${NC}"