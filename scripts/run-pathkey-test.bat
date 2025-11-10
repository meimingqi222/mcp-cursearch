@echo off
REM Script to run PathKey validation tests on Windows
REM This script compiles the TypeScript code and runs the test

echo 🔨 Building TypeScript code...
call npx tsc -p .

if %errorlevel% neq 0 (
  echo ❌ Build failed!
  exit /b %errorlevel%
)

echo.
echo 🧪 Running PathKey validation tests...
echo.

node dist\test-pathkey-validation.js

exit /b %errorlevel%

