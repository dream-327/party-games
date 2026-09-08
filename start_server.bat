@echo off
chcp 65001 >nul
title 聚会游戏盒子 - 本地服务器 (Party Games Hub)
cd /d "%~dp0"

echo ========================================================
echo        🎉 聚会游戏盒子 (Party Games Hub) 服务器
echo ========================================================
echo.
echo 正在启动本地游戏服务器 (端口 3000)...
echo 包含游戏: 《谁是卧底》 + 《欢乐斗地主》
echo.

node server.js

pause
