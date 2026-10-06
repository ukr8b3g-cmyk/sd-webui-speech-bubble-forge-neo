"""Regression gates for incomplete API requests and Pillow decorations."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from speech_bubble_forge import api
from speech_bubble_forge import settings as settings_module
from speech_bubble_forge.renderer import _draw_bubble, _apply_element_opacity


@pytest.fixture
def client(tmp_path):
    with patch.object(settings_module, "data_root", lambda: tmp_path):
        app = FastAPI()
        api.register_routes(app)
        with TestClient(app, raise_server_exceptions=False) as result:
            yield result


@pytest.mark.parametrize("payload", [{}, {"layout_json": None}, {"layout_json": []},
                                     {"layout_json": True}, {"layout_json": 42},
                                     {"layout_json": ""}, {"layout_json": "   "}])
def test_invalid_save_keeps_existing_file(client, payload):
    url = "/speech-bubble-forge/layout/" + "a" * 64
    valid = {"version": 1, "elements": [{"type": "text", "text": "Keep me"}]}
    assert client.put(url, json={"layout_json": valid}).status_code == 200
    disk = api._layout_file("a" * 64)
    before = disk.read_bytes()
    response = client.put(url, json=payload)
    assert response.status_code == 400, response.text
    assert disk.read_bytes() == before
    assert json.loads(client.get(url).json()["layout_json"]) == valid


@pytest.mark.parametrize("empty", [{}, "{}"])
def test_explicit_empty_save_remains_supported(client, empty):
    url = "/speech-bubble-forge/layout/" + "a" * 64
    assert client.put(url, json={"layout_json": empty}).status_code == 200
    assert json.loads(client.get(url).json()["layout_json"]) == {}


@pytest.mark.parametrize("method,endpoint", [("put", "/speech-bubble-forge/layout/" + "a" * 64), ("post", "/speech-bubble-forge/export"), ("post", "/speech_bubble/presets")])
@pytest.mark.parametrize("raw", ["[]", "null", '"text"', "42", "{broken"])
def test_json_root_errors_are_400(client, method, endpoint, raw):
    response = getattr(client, method)(endpoint,
                                      content=raw, headers={"Content-Type": "application/json"})
    assert response.status_code == 400, response.text


@pytest.mark.parametrize("style", ["overlap", "radiant"])
def test_pillow_decorations_have_visible_pixels(style):
    base = {"x": 40, "y": 40, "w": 130, "h": 100, "shape": "oval",
            "fill": "#ffffff", "stroke": "#000000", "stroke_width": 4}
    plain = Image.new("RGBA", (240, 200), (0, 0, 0, 0))
    decorated = plain.copy()
    _draw_bubble(plain, base, 1)
    _draw_bubble(decorated, {**base, "decoration_style": style}, 1)
    assert decorated.tobytes() != plain.tobytes()
    _apply_element_opacity(decorated, {"opacity": 0})
    assert decorated.getchannel("A").getbbox() is None
