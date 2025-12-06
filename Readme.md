# Algoooeee Project

Welcome to the Algoooeee project! This repository hosts algorithms and data structures implementations. We use a standard fork-and-pull-request workflow for all contributions.

## Prerequisites

Before you begin, ensure you have Git installed on your local machine.

*   **Install Git**: You can download and install the latest version from the official [Git-SCM website](git-scm.com).

## Setup Instructions

Follow these steps to get the project running locally and configure it for contributing:

### Step 1: Fork the Repository on GitHub

The first step is to create a personal copy (a "fork") of the main project repository in your own GitHub account.

1.  Open your web browser and navigate to the main project page:
    [github.com](github.com)
2.  In the top-right corner of the page, click the **"Fork"** button. This creates a copy of the repository under your GitHub username (e.g., `github.com`).

### Step 2: Clone Your Fork Locally

Now, you need to download your personal fork to your local machine.

1.  Go to your *forked* repository page on GitHub.
2.  Click the green **"Code"** button and copy the HTTPS URL.
3.  Open your terminal or command prompt.
4.  Run the following command, replacing `YOUR_FORK_URL` with the URL you copied in the previous step:

    ```bash
    git clone YOUR_FORK_URL
    ```

5.  Navigate into the newly created project directory:

    ```bash
    cd Algoooeee
    ```

### Step 3: Configure the Original ("Upstream") Repository

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
4.  **Push** your branch to *your fork* (`origin`):
    `git push origin feature/your-feature-name`
5.  Go to your fork on GitHub and **open a Pull Request** back to the original `atultvarghese/Algoooeee` repository.
