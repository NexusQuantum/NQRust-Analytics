#!/bin/bash

# Nexus Analytics Demo Startup Script
# This script sets up and starts the rebranded Analytics AI system for demo purposes

set -e

echo "🚀 Starting Nexus Analytics Demo Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Try docker info with and without sudo
if docker info &> /dev/null; then
    DOCKER_CMD="docker"
    COMPOSE_CMD="docker compose"
elif sudo docker info &> /dev/null; then
    echo -e "${YELLOW}⚠️  Using sudo for Docker commands${NC}"
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker compose"
else
    echo -e "${RED}❌ Docker is not running. Please start Docker first:${NC}"
    echo -e "${BLUE}   sudo systemctl start docker${NC}"
    echo -e "${BLUE}   Or add yourself to docker group: sudo usermod -aG docker \$USER${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed and running${NC}"

# Check if .env file exists, create a minimal one if not
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating minimal demo configuration...${NC}"
    cat > .env << EOF
# Minimal demo configuration for Nexus Analytics
OPENAI_API_KEY=your-api-key-here

# LangFuse (optional for telemetry)
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
EOF
    echo -e "${BLUE}📝 Created .env file. Please add your OpenAI API key before running the demo.${NC}"
fi

# Check if OpenAI API key is set
if ! grep -q "^OPENAI_API_KEY=sk-" .env 2>/dev/null; then
    echo -e "${YELLOW}⚠️  OpenAI API key not found or invalid in .env file${NC}"
    echo -e "${BLUE}💡 Please set OPENAI_API_KEY=sk-... in .env file${NC}"
    echo -e "${BLUE}💡 You can get one from https://platform.openai.com/api-keys${NC}"
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create data directory if it doesn't exist
if [ ! -d "data" ]; then
    echo -e "${BLUE}📁 Creating data directory...${NC}"
    mkdir -p data
fi

# Check if analytics-ui has been built locally
if [ ! -f "analytics-ui/Dockerfile" ]; then
    echo -e "${RED}❌ analytics-ui Dockerfile not found. Make sure you're running this from the project root.${NC}"
    exit 1
fi

echo -e "${BLUE}🏗️  Building custom analytics-ui with your branding...${NC}"
cd analytics-ui
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found in analytics-ui directory${NC}"
    exit 1
fi

# Build the custom UI (this includes your logo changes)
echo -e "${YELLOW}⏳ This may take a few minutes...${NC}"
cd ..

echo -e "${BLUE}🐳 Starting services with Docker Compose...${NC}"
$COMPOSE_CMD -f docker-compose-demo.yaml up -d

echo -e "${GREEN}🎉 Demo startup complete!${NC}"
echo ""
echo -e "${BLUE}📊 Access your Nexus Analytics demo at:${NC}"
echo -e "${GREEN}   http://localhost:3000${NC}"
echo ""
echo -e "${BLUE}🔧 Service endpoints:${NC}"
echo -e "   • UI: http://localhost:3000"
echo -e "   • AI Service: http://localhost:5555"
echo ""
echo -e "${YELLOW}💡 Demo Features to Show:${NC}"
echo -e "   • Natural language to SQL queries"
echo -e "   • Database schema exploration"
echo -e "   • Data visualization and charts"
echo -e "   • Your custom Nexus Analytics branding"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo -e "   • Stop demo: docker-compose -f docker-compose-demo.yaml down"
echo -e "   • View logs: docker-compose -f docker-compose-demo.yaml logs -f"
echo -e "   • Restart: docker-compose -f docker-compose-demo.yaml restart"
echo ""
echo -e "${GREEN}🚀 Ready to demo! The services are starting up - give them 1-2 minutes to be fully ready.${NC}"