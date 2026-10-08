"""Every Python entrypoint's venv guard (EPOCH-416, ILEAPP-21): without the
repo's .venv it says why and exits 2, with no traceback after the message."""

import pytest

import runtime_env


def test_missing_venv_exits_2_with_the_reason(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(runtime_env, "repo_root", lambda: tmp_path)
    with pytest.raises(SystemExit) as exited:
        runtime_env.fatal_if_missing_venv()
    assert exited.value.code == 2
    err = capsys.readouterr().err
    assert err.startswith("[env] This repo requires a local Python virtual environment")
    assert "Traceback" not in err


def test_present_venv_passes(tmp_path, monkeypatch):
    (tmp_path / ".venv" / "bin").mkdir(parents=True)
    (tmp_path / ".venv" / "bin" / "python").touch()
    monkeypatch.setattr(runtime_env, "repo_root", lambda: tmp_path)
    runtime_env.fatal_if_missing_venv()
