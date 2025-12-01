# Nexus Analytics Demo Guide

This guide helps you quickly set up and run a demo of your rebranded Nexus Analytics system (based on Analytics AI) for client presentations.

## Prerequisites

- **Docker & Docker Compose**: Installed and running
- **OpenAI API Key**: Required for AI features
- **8GB+ RAM**: Recommended for smooth operation
- **Ports Available**: 3000, 5555

## Quick Start (One-Click Demo)

### Option 1: Automated Script
```bash
./demo-start.sh
```

This script will:
- ✅ Check prerequisites
- 🏗️ Build your custom UI with Nexus branding
- 🐳 Start all services
- 📊 Provide access URLs

### Option 2: Manual Setup

1. **Create Environment File**
   ```bash
   cp docker/.env.example .env
   # Edit .env and set your OPENAI_API_KEY
   ```

2. **Start Services**
   ```bash
   docker-compose -f docker-compose-demo.yaml up -d
   ```

3. **Access Demo**
   - Open: http://localhost:3000

## Demo Features to Showcase

### 🎯 Core Capabilities
- **Natural Language Queries**: "Show me sales by region this quarter"
- **Smart SQL Generation**: AI converts plain English to SQL
- **Data Visualization**: Auto-generates charts and graphs
- **Schema Discovery**: Automatically understands database structure

### 🎨 Custom Branding
- **Nexus Analytics Logo**: Your custom branding throughout
- **Professional Interface**: Clean, client-ready design
- **Custom Styling**: Tailored to match your brand identity

### 📊 Demo Scenarios
1. **Business Questions**: 
   - "What are our top performing products?"
   - "Show revenue trends by month"
   - "Which customers have the highest lifetime value?"

2. **Data Exploration**:
   - Browse database schema
   - Understand table relationships
   - Explore column meanings

3. **Visualization**:
   - Generate charts from queries
   - Interactive data displays
   - Export capabilities

## Demo Management

### Service Control
```bash
# Stop demo
docker-compose -f docker-compose-demo.yaml down

# View logs
docker-compose -f docker-compose-demo.yaml logs -f

# Restart specific service
docker-compose -f docker-compose-demo.yaml restart analytics-ui

# Check service status
docker-compose -f docker-compose-demo.yaml ps
```

### Monitoring
- **UI Health**: http://localhost:3000 (should show login/setup)
- **AI Service**: http://localhost:5555/docs (API documentation)
- **Service Logs**: Use `docker-compose logs -f [service-name]`

## Troubleshooting

### Common Issues

**Port Conflicts**
```bash
# Check what's using ports
netstat -tulpn | grep :3000
# Kill processes if needed
sudo lsof -t -i:3000 | xargs kill -9
```

**Services Not Starting**
```bash
# Check Docker resources
docker system df
docker system prune  # Clean up if needed

# Restart all services
docker-compose -f docker-compose-demo.yaml down
docker-compose -f docker-compose-demo.yaml up -d
```

**UI Not Loading**
1. Wait 2-3 minutes for services to fully start
2. Check logs: `docker-compose -f docker-compose-demo.yaml logs analytics-ui`
3. Ensure all dependencies are running

**API Key Issues**
- Verify OpenAI API key is set in `.env`
- Check API key has sufficient credits
- Ensure key format: `sk-...`

## Demo Presentation Tips

### 🎪 Pre-Demo Setup (5 minutes)
1. Run `./demo-start.sh` 
2. Wait for services to be ready
3. Open http://localhost:3000 in browser
4. Have sample database ready (or use built-in examples)

### 🎬 Demo Flow (15-20 minutes)
1. **Introduction** (2 min): Show Nexus Analytics interface
2. **Natural Language Query** (5 min): Demonstrate AI-powered querying
3. **Data Visualization** (5 min): Show chart generation
4. **Schema Intelligence** (3 min): Demonstrate database understanding
5. **Q&A** (5 min): Answer client questions

### 💡 Key Selling Points
- **Zero Learning Curve**: Business users can query data instantly
- **No SQL Required**: Plain English gets accurate results
- **Instant Insights**: AI generates visualizations automatically
- **Enterprise Ready**: Secure, scalable, customizable

## Configuration

### Environment Variables (.env)
```bash
# Required
OPENAI_API_KEY=sk-your-key-here

# Optional
LANGFUSE_SECRET_KEY=your-langfuse-key
LANGFUSE_PUBLIC_KEY=your-langfuse-public-key
```

### Custom Branding
Your Nexus Analytics branding is built into the UI through:
- Logo files in `analytics-ui/public/images/`
- Component modifications in `analytics-ui/src/components/`
- Color scheme and styling updates

## Support

### For Issues During Demo
1. Check service logs
2. Restart problematic services
3. Have backup slides ready
4. Use mobile hotspot if network issues

### Post-Demo
- Clean up: `docker-compose -f docker-compose-demo.yaml down`
- Gather feedback and questions
- Schedule follow-up technical discussions

---

**Ready to impress your clients with Nexus Analytics! 🚀**