#!/bin/bash

# Script to run PathKey validation tests
# This script compiles the TypeScript code and runs the test

echo "🔨 Building TypeScript code..."
npx tsc -p .

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo ""
echo "🧪 Running PathKey validation tests..."
echo ""

node dist/test-pathkey-validation.js

exit $?

