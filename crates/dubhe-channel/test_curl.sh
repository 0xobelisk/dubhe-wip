#!/bin/bash

# Curl examples for testing /health and /nonce

echo "=========================================="
echo "1. Health check (GET /health)"
echo "=========================================="
echo ""
echo "curl http://localhost:8080/health"
echo ""
curl -s http://localhost:8080/health
echo ""
echo ""

echo "=========================================="
echo "2. Get nonce (POST /nonce)"
echo "=========================================="
echo ""
echo "curl -X POST http://localhost:8080/nonce -H \"Content-Type: application/json\" -d '{\"sender\": \"0x15fde77101778fafe8382743171294dfd8e7900a547711ee375379c27a85fd31\"}'"
echo ""
curl -s -X POST http://localhost:8080/nonce \
  -H "Content-Type: application/json" \
  -d '{"sender": "0x15fde77101778fafe8382743171294dfd8e7900a547711ee375379c27a85fd31"}'
echo ""
