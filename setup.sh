#!/bin/bash
# Run this once on each fresh GCP VM

# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install useful tools
sudo apt-get install -y htop curl wget screen

# Create chakram directory
mkdir -p ~/.chakram

echo "VM setup complete. Ready for Chakram deployment."
