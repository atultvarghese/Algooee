# Algoooeee Project

Welcome to the Algoooeee project! This repository is for algorithmic trading implementations. We use a standard fork-and-pull-request workflow for all contributions.

[Join our Discord Community](https://discord.gg/8bGeKNdr)

## Prerequisites

Before you begin.

- **Install Git**: You can download and install the latest version from the official [Git-SCM website](https://git-scm.com/install/).
- **Install Python**: You can download and install the python.3.14.xx version from the official [Python-ORG website](https://www.python.org/downloads/).

## Setup Instructions

Follow these steps to get the project running locally and configure it for contributing:

### Step 1: Fork the Repository on GitHub

The first step is to create a personal copy (a "fork") of the main project repository in your own GitHub account.

1.  Open your web browser and navigate to the main project page:
    [github.com](github.com)
2.  In the top-right corner of the page, click the **"Fork"** button. This creates a copy of the repository under your GitHub username (e.g., `github.com`).

### Step 2: Clone Your Fork Locally

Now, you need to download your personal fork to your local machine.

1.  Go to your _forked_ repository page on GitHub.
2.  Click the green **"Code"** button and copy the HTTPS URL.

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

Open `.env` and add your `UPSTOX_API_TOKEN`:

```bash
.env 
```

### 3. Run the Server (Development)

Start the development server using the following command:

```powershell
uvicorn server:app --reload
```

### 4. Open the UI in Your Browser

Navigate to `http://localhost:8000/` to access the web UI.

## Notes

- The web UI is served from `app/templates/index.html` and static assets are in `app/static/`.
- If you don't have an Upstox token, the UI will load but prediction calls will return a 503.
