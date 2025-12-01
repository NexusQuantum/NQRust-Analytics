import types

import pytest


def test_builder_fluent_api(monkeypatch):
    from src.core.builder import ServiceContainerBuilder

    dummy_settings = types.SimpleNamespace()
    dummy_components = {"x": object()}

    builder = ServiceContainerBuilder(
        settings=dummy_settings, pipe_components=dummy_components
    )

    # Fluent methods return self
    assert builder.with_settings(dummy_settings) is builder
    assert builder.with_components(dummy_components) is builder


def test_builder_build_delegates_to_create_service_container(monkeypatch):
    from src.core import builder as builder_module

    called = {}

    def fake_create_service_container(*, pipe_components, settings):  # type: ignore[no-redef]
        called["pipe_components"] = pipe_components
        called["settings"] = settings
        return object()

    # Patch src.globals.create_service_container referenced inside builder.build
    monkeypatch.setattr(
        "src.globals.create_service_container", fake_create_service_container
    )

    dummy_settings = types.SimpleNamespace()
    dummy_components = {"pc": object()}

    sc = builder_module.ServiceContainerBuilder(
        settings=dummy_settings, pipe_components=dummy_components
    )

    # Bypass validation for this delegation test by monkeypatching _validate
    monkeypatch.setattr(sc, "_validate", lambda: None)

    sc = sc.build()

    assert isinstance(sc, object)
    assert called["pipe_components"] is dummy_components
    assert called["settings"] is dummy_settings


def test_builder_validate_missing_components_raises():
    from src.core.builder import ServiceContainerBuilder

    with pytest.raises(KeyError):
        ServiceContainerBuilder(settings=object(), pipe_components={}).build()
