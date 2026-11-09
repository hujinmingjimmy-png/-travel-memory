@echo off
setlocal

pushd "%~dp0" || exit /b 1
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo Node.js and npm are required. Install a Node.js version supported by frontend/package.json.
    popd
    exit /b 1
)

pushd "..\frontend" || (
    echo Could not open the frontend directory.
    popd
    exit /b 1
)

call npm.cmd ls --depth=0 --include=dev >nul 2>&1
if errorlevel 1 (
    echo Installing frontend dependencies...
    call npm.cmd ci --include=dev --no-audit --no-fund
    if errorlevel 1 goto :frontend_failed
)

echo Building the frontend...
if /i "%~1"=="package" (
    call npm.cmd run build:release
) else (
    call npm.cmd run build
)
if errorlevel 1 goto :frontend_failed
popd

rem The Maven Wrapper calls Windows PowerShell by name.
set "PATH=%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%"
if /i "%~1"=="package" goto :package

set "SPRING_WEB_RESOURCES_STATIC_LOCATIONS=classpath:/webapp/"
if not defined SERVER_PORT set "SERVER_PORT=8080"
echo Starting Travel Memory at http://localhost:%SERVER_PORT%/
call "%~dp0mvnw.cmd" --no-transfer-progress -Pfullstack spring-boot:run %*
goto :finish

:package
call "%~dp0mvnw.cmd" --no-transfer-progress -Pfullstack clean package

:finish
set "launch_result=%ERRORLEVEL%"
popd
exit /b %launch_result%

:frontend_failed
echo The frontend build could not be prepared. Spring Boot was not started.
popd
popd
exit /b 1
