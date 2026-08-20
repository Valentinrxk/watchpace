@echo off
cd /d "%~dp0.."
node scripts/sync.mjs >> cache\sync.log 2>&1
