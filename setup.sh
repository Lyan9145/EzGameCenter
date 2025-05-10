#!/bin/bash

# One-click deployment script for EzGameCenter on Linux

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}EzGameCenter Installation Script${NC}"
echo -e "${YELLOW}============================${NC}"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip
else
    echo -e "${GREEN}Python 3 is already installed.${NC}"
fi

# Check if venv module is available
if ! python3 -m venv --help &> /dev/null; then
    echo -e "${RED}Python venv module is not installed. Installing...${NC}"
    sudo apt-get install -y python3-venv
else
    echo -e "${GREEN}Python venv module is already installed.${NC}"
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}Virtual environment created.${NC}"
else
    echo -e "${GREEN}Virtual environment already exists.${NC}"
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate

# Check if requirements.txt exists
if [ -f "requirements.txt" ]; then
    echo -e "${YELLOW}Installing dependencies from requirements.txt...${NC}"
    pip install -r requirements.txt
    echo -e "${GREEN}Dependencies installed successfully.${NC}"
else
    echo -e "${RED}requirements.txt not found. Please make sure it exists in the current directory.${NC}"
    exit 1
fi

# Run the application
echo -e "${YELLOW}Starting EzGameCenter...${NC}"
if [ -f "run_no_debug.py" ]; then
    python run_no_debug.py
else
    echo -e "${RED}Unable to find the application file (run_no_debug.py).${NC}"
    echo -e "${YELLOW}Please run the application manually after this setup is complete.${NC}"
    exit 1
fi

echo -e "${GREEN}Setup completed!${NC}"