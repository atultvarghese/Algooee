#!/usr/bin/env python3
"""
Algooee Cross-Platform Bundling Script
Usage: python bundle.py

This script:
1. Installs npm dependencies and builds Vite React.
2. Bundles the FastAPI backend + static assets into a single binary.
3. Automatically formats options for Windows, macOS, and Linux.
"""

import os
import platform
import shutil
import subprocess
import sys
import tempfile


def print_step(title):
    border = "=" * 40
    print(f"\n{border}\n[STEP] {title}\n{border}")


def check_command(cmd):
    """Check if a system command is available."""
    return shutil.which(cmd) is not None


def run_command(cmd_list, shell=False):
    """Run a system command and handle failure."""
    try:
        res = subprocess.run(cmd_list, shell=shell, check=True)
        return res.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {' '.join(cmd_list)}")
        print(f"Exit code: {e.returncode}")
        sys.exit(1)


def main():
    print_step("Checking prerequisites")

    if not check_command("npm"):
        print("Error: 'npm' is not installed or not in PATH. Please install Node.js first.")
        sys.exit(1)

    # Check for PyInstaller
    has_pyinstaller = check_command("pyinstaller")
    if not has_pyinstaller:
        print("PyInstaller not found in system PATH. Attempting to run via Python module...")

    # Determine current OS details
    system_os = platform.system()
    print(f"Detected Platform: {system_os}")

    # Step 1: Install frontend dependencies
    print_step("Installing Frontend Dependencies (npm)")
    npm_cmd = ["npm", "install"]
    if system_os == "Windows":
        run_command(npm_cmd, shell=True)
    else:
        run_command(npm_cmd)

    # Step 2: Build the Vite frontend
    print_step("Compiling Frontend Static Assets (Vite)")
    build_cmd = ["npm", "run", "build"]

    temp_db_path = None
    dist_db_path = os.path.join("dist", "paper_trade.db")
    if os.path.exists(dist_db_path):
        temp_db_fd, temp_db_path = tempfile.mkstemp(prefix="paper_trade_", suffix=".db")
        os.close(temp_db_fd)
        shutil.copy2(dist_db_path, temp_db_path)
        print("Preserved existing 'dist/paper_trade.db' before frontend build.")

    try:
        if system_os == "Windows":
            run_command(build_cmd, shell=True)
        else:
            run_command(build_cmd)
    finally:
        if temp_db_path and os.path.exists(temp_db_path):
            os.makedirs("dist", exist_ok=True)
            shutil.copy2(temp_db_path, dist_db_path)
            os.remove(temp_db_path)
            print("Restored 'dist/paper_trade.db' after frontend build.")

    if not os.path.exists("dist"):
        print("Error: 'dist' folder was not created by the frontend build. Cannot proceed.")
        sys.exit(1)

    # Step 3: Bundle python app using PyInstaller
    print_step("Packaging Application via PyInstaller")

    # PyInstaller uses different path separators for --add-data depending on the OS
    # macOS/Linux uses colon (:), Windows uses semicolon (;)
    separator = ";" if system_os == "Windows" else ":"
    data_arg = f"dist{separator}dist"

    pyinstaller_args = [
        "--onefile",
        "--clean",
        "--name", "algooee",
        "--add-data", data_arg,
        "server.py"
    ]

    # Decide execution method (direct path vs python module execution)
    if has_pyinstaller:
        cmd = ["pyinstaller"] + pyinstaller_args
    else:
        # Fall back to running via python interpreter (handles virtualenvs nicely)
        cmd = [sys.executable, "-m", "PyInstaller"] + pyinstaller_args

    print(f"Running command: {' '.join(cmd)}")
    try:
        run_command(cmd)
    except SystemExit:
        print("\nFailed to run PyInstaller. Please verify it is installed:")
        print("  pip install pyinstaller")
        sys.exit(1)

    print_step("Packaging Completed Successfully!")
    exe_extension = ".exe" if system_os == "Windows" else ""
    binary_name = f"algooee{exe_extension}"
    target_path = os.path.join("dist", binary_name)

    # Copy .env file to dist/ if it exists in the root folder
    if os.path.exists(".env"):
        shutil.copy(".env", os.path.join("dist", ".env"))
        print("Copied '.env' file to 'dist/' directory next to the binary.")

    print(f"Your standalone executable is located at:\n  {os.path.abspath(target_path)}")
    print("\nTo share with your friends:")
    print(f"1. Send them the '{binary_name}' file.")
    print("2. When they run it, it starts the web server locally.")
    print("3. They can open their browser to http://127.0.0.1:8000 and use the dashboard.")
    print(
        "Note: The application will automatically create and persist trade logs\n"
        "in a local 'paper_trade.db' file next to the binary."
    )


if __name__ == "__main__":
    main()
