# Shared Libraries (`libs/`)

This directory houses domain-agnostic utilities and runtime helpers shared across Python extraction scripts, migration tools, and orchestration processes. 

* **`runtime-env/`**: Contains execution guards (`runtime_env.py`) to verify that a repository-local `.venv` environment is active before any backend script or pipeline command runs.