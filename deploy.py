import os
import subprocess
import sys

# Find repo root from this script's location
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
print(f"REPO_ROOT: {REPO_ROOT}")
print(f"cwd: {os.getcwd()}")
print(f"ls cwd: {os.listdir('.')}")

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
req_path = os.path.join(REPO_ROOT, "flask-app", "requirements.txt")
run([sys.executable, "-m", "pip", "install", "-r", req_path])

# 3. Install JS dependencies with pnpm (ignore scripts for safety)
run(["/tmp/pnpm", "install", "--ignore-scripts"], cwd=REPO_ROOT)

# 4. Build frontend
frontend_dir = os.path.join(REPO_ROOT, "artifacts", "gestione-turni-react")
frontend_env = {**os.environ, "PORT": "5173", "BASE_PATH": "/"}
run(
    ["/tmp/pnpm", "exec", "vite", "build", "--config", "vite.config.ts"],
    cwd=frontend_dir,
    env=frontend_env,
)

print("Build completed successfully.")
