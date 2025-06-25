#!/bin/bash
echo "Starting all RASS services in detached mode..."
docker-compose up -d --build
echo "All services are starting. Run 'docker-compose ps' to see their status."