@echo off
chcp 65001 >nul
title 聚会游戏盒子 - 一键启动服务与穿透
cd /d "%~dp0"

echo ========================================================
echo        🚀 聚会游戏盒子 - 一键启动本地服务与公网穿透
echo ========================================================
echo.
echo 1. 正在后台启动游戏服务器...
start "聚会游戏盒子 - 服务器" cmd /k "node server.js"

timeout /t 2 >nul

echo 2. 正在启动 Cloudflare 公网穿透隧道...
start "聚会游戏盒子 - 公网穿透" cmd /k "cloudflared.exe tunnel --url http://localhost:3000"

echo.
echo ✅ 全部启动完毕！请在弹出的穿透窗口中复制 https://xxx.trycloudflare.com 地址分享给朋友。
echo.
