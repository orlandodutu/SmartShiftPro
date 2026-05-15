import os
import subprocess
import sys

def run(cmd, cwd=None, env=None):
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, env=env, check=True)

# 1. Download pnpm standalone binary to /tmp (writable)
run([
    "curl", "-fsSL",
    "https://github.com/pnpm/pnpm/releases/download/v9.15.0/pnpm-linux-x64",
    "-o", "/tmp/pnpm"
])
run(["chmod", "+x", "/tmp/pnpm"])

# 2. Install Python dependencies
run([sys.executable, "-m", "pip", "install", "-r", "flask-app/requirements.txt"])

# 3. Install JS dependencies with pnpm (ignore scripts for safety)
run(["/tmp/pnpm", "install", "--ignore-scripts"])

# 4. Build frontend
frontend_env = {**os.environ, "PORT": "5173", "BASE_PATH": "/"}
run(
    ["/tmp/pnpm", "exec", "vite", "build", "--config", "vite.config.ts"],
    cwd="artifacts/gestione-turni-react",
    env=frontend_env,
)

print("Build completed successfully.")
