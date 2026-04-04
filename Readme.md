# Algoooeee Project

Welcome to the Algoooeee project! This repository is for algorithmic trading implementations. We use a standard fork-and-pull-request workflow for all contributions.

[Join our Discord Community](https://discord.gg/8bGeKNdr)

## Prerequisites

Before you begin.

- **Install Git**: You can download and install the latest version from the official [Git-SCM website](https://git-scm.com/install/).
- **Install Python**: You can download and install the python.3.14.xx version from the official [Python-ORG website](https://www.python.org/downloads/).

## Setup Instructions

Follow these steps to get the project running locally and configure it for contributing:

### Step 1: Clone the Repository open git bash

```bash
git clone https://github.com/atultvarghese/Algooee.git
```

### Step 2: Create a devlopment branch for your feature

```bash
cd Algooee
git checkout -b dev_new_feature
```

# Algooee

Lightweight stock prediction project with a FastAPI backend and a minimal UI.

## Quick Start

Follow these steps to set up and run the project:

### 1. Create a Virtual Environment and Install Dependencies

Run the following commands based on your operating system:

- **macOS/Linux**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    python3 -m pip install -r requirements.txt
    ```

- **Windows**:
    ```powershell
    python -m venv venv
    venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    ```

### 2. Configure Environment Variables

Refer:
https://upstox.com/developer/api-documentation/sandbox this page to create the token(free of cost just need an Upstox demat account (If you need to create account use this link https://upstox.onelink.me/0H1s/4BA7NP))

Open `.env` and add your `UPSTOX_API_TOKEN` 


```bash
.env 
```

### 3. Run the Server (Development)

Start the development server using the following command:

```powershell
uvicorn server:app --reload
```
## 4. Run the Client (Development)

Start the development client fronten using the following command:

```powershell
npm install
npm run build 
npm run dev
```

## Open UI
[http://localhost:3000/](http://localhost:3000/)

## Code Quality Tools
### We use Black for formatting, Ruff for linting, and Pytest for testing.
1.  Format code

```bash
black .
```

2. Lint code
```bash
ruff check .
```

3. Running Unit Tests

This project uses pytest for unit testing. Tests cover core prediction models, paper trading logic, and web endpoints.

- Run All Tests

```bash
pytest tests/ -v
```
Test files are located in the tests/ folder

- Run Specific Test File
```bash
pytest tests/test_core.py -v
```

- Run Specific Test Function
```bash
pytest tests/test_core.py::test_feature_engineering -v
```

## Notes

- If you don't have an Upstox token, prediction endpoints will return a 503 and the UI will show all the values as zero by default
- The repository now includes Python tooling and a tests directory for maintainable, high-quality code.
- Follow the style guides to keep the project consistent and clean.
