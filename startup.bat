@echo off
timeout /t 10
cd /d "C:\Users\USER\Trend-"
npx pm2 resurrect
