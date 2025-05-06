#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   Scribble Game - Running Unit Tests  ${NC}"
echo -e "${BLUE}=======================================${NC}"

# Run all tests
echo -e "\n${GREEN}Running all tests...${NC}"
npx jest

# Run specific test files
echo -e "\n${GREEN}Running specific test files...${NC}"
echo -e "${BLUE}Room Service Tests:${NC}"
npx jest src/room/tests/room.service.spec.ts

echo -e "\n${BLUE}Room Gateway Tests:${NC}"
npx jest src/room/tests/room.gateway.spec.ts

echo -e "\n${BLUE}Game Service Tests:${NC}"
npx jest src/game/tests/game.service.spec.ts

# Run tests with coverage
echo -e "\n${GREEN}Running tests with coverage report...${NC}"
npx jest --coverage

echo -e "\n${GREEN}Done!${NC}" 