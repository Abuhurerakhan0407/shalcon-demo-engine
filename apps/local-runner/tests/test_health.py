from shalcon_runner.health import get_health, health_dict


def test_runner_health_is_phase_zero_and_ready() -> None:
    health = get_health()
    assert health.ok is True
    assert health.service == "shalcon-local-runner"
    assert health.phase == 0
    assert health.mode == "foundation"


def test_health_dict_is_json_safe_shape() -> None:
    payload = health_dict()
    assert payload["ok"] is True
    assert isinstance(payload["version"], str)
    assert isinstance(payload["python"], str)
