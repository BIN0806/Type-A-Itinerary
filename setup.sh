#!/bin/bash

# V2V Project Setup Script
# Installs all dependencies for backend and mobile

set -e  # Exit on error

echo "Project Setup"
echo "===================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker found${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose found${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required. Found: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) found${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v) found${NC}"

echo ""
echo "📦 Installing dependencies..."
echo ""

# Install mobile dependencies
echo "📱 Installing mobile dependencies..."
cd mobile
if [ -d "node_modules" ]; then
    echo "  node_modules exists, running npm install to update..."
fi
npm install
cd ..
echo -e "${GREEN}✅ Mobile dependencies installed${NC}"
echo ""

# Backend dependencies are handled by Docker, but check if .env exists
echo "🔧 Checking backend configuration..."
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚠️  backend/.env not found${NC}"
    if [ -f "backend/.env.example" ]; then
        echo "  Copying .env.example to .env..."
        cp backend/.env.example backend/.env
        echo -e "${YELLOW}⚠️  Please edit backend/.env and add your API keys before starting the backend${NC}"
    else
        echo -e "${YELLOW}⚠️  Please create backend/.env with your API keys${NC}"
    fi
else
    echo -e "${GREEN}✅ Backend .env file found${NC}"
fi
echo ""

echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Configure API keys in backend/.env:"
echo "   - OPENAI_API_KEY"
echo "   - GOOGLE_MAPS_API_KEY"
echo "   - JWT_SECRET"
echo ""
echo "2. Start backend services:"
echo "   cd infra && docker-compose up --build"
echo ""
echo "3. Start mobile app (in a new terminal):"
echo "   cd mobile && npm start"
echo ""
echo "For more details, see QUICKSTART.md or README.md"
