@echo off
chcp 65001 >nul
title 聚会游戏盒子 - Cloudflare 公网隧道穿透
cd /d "%~dp0"

echo ========================================================
echo        🌐 聚会游戏盒子 - Cloudflare 异地公网穿透
echo ========================================================
echo.
echo 正在建立安全公网隧道映射本地 http://localhost:3000 ...
echo 连接成功后，下方日志中会出现形如:
echo https://xxxx.trycloudflare.com 的公网网址。
echo 异地好友直接用手机或电脑打开该网址即可联机对局！
echo.

cloudflared.exe tunnel --url http://localhost:3000

pause
