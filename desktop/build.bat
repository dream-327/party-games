@echo off
chcp 65001 >nul
echo ====================================================
echo 🎮 正在编译《聚会游戏盒子》Windows 桌面客户端...
echo ====================================================

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if not exist %CSC% (
    echo ❌ 未找到 .NET 编译器：%CSC%
    pause
    exit /b 1
)

%CSC% /target:winexe /win32icon:"%~dp0app.ico" /out:"%~dp0聚会游戏盒子.exe" "%~dp0Program.cs"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ 客户端编译成功！生成文件: %~dp0聚会游戏盒子.exe
    echo 💡 您可以直接将「聚会游戏盒子.exe」发送给微信/QQ好友畅玩！
) else (
    echo.
    echo ❌ 编译失败，请检查错误日志。
)

pause
