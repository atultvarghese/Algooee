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
3.  Open your terminal or command prompt.
4.  Run the following command, replacing `YOUR_FORK_URL` with the URL you copied in the previous step:

    ```bash
    git clone YOUR_FORK_URL
    ```

5.  Once the clone is successfull you will see the folder got created as "Algoooeee"

### Step 3: Setting up and run the app from scratch

1.  Navigate into the newly created project directory:

    ```bash
    cd Algoooeee
    ```

2.  Create a python virtual envionment and install the libraires required:

    ```bash
    python -m venv venv
    source venv/Scripts/activate
    pip install -r requirements.txt
    python main.py
    ```

    You should see the packages got installed succcessfully into the venv


3.  Create file .env in the root folder for Upstox API key [Sandbox APIs Documentation](https://upstox.com/developer/api-documentation/sandbox):

    ```
    # .env file content
    UPSTOX_API_TOKEN="YOUR_ACTUAL_UPSTOX_API_TOKEN_HERE"
    ```

### Step 4: Configure the Original ("Upstream") Repository

To keep your local copy in sync with the main project repository, you should add the original repo as an "upstream" remote.

1.  Add the original repository as an upstream remote:

    ```bash
    git remote add upstream github.com
    ```

2.  Verify that both remotes are configured correctly:

    ```bash
    git remote -v
    ```

    You should see both your `origin` (your fork) and the `upstream` (the main project):

    ```
    origin    github.com (fetch)
    origin    github.com (push)
    upstream  github.com (fetch)
    upstream  github.com (push)
    ```

## Contributing

Once your project is set up, you are ready to make changes:

1.  **Sync** your local `main` branch with the `upstream` `main` branch:
    `git pull upstream main`
2.  **Create a new branch** for your specific feature or fix:
    `git checkout -b feature/your-feature-name`
3.  **Make your changes**, `add`, and `commit` them locally.
4.  **Push** your branch to _your fork_ (`origin`):
    `git push origin feature/your-feature-name`
5.  Go to your fork on GitHub and **open a Pull Request** back to the original `atultvarghese/Algoooeee` repository.
