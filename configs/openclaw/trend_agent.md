---
name: trend_agent
description: An autonomous agent that scans trends and deploys tokens on Base Mainnet.
---
# Trend Agent

This skill allows you to trigger the autonomous trend detection and deployment cycle.

## Usage
Use this skill when the user asks to "run the agent", "check trends", or "deploy tokens".

## Scripts

### run_agent
Runs the autonomous agent pipeline.
```bash
npx hardhat run src/run_pipeline.js --network base
```
