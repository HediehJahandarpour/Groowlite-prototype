#!/usr/bin/env python3
"""Measure provisional phase-colour associations for Groow activity tokens.

Official phase metadata is not in the project. This script reads the five
phase tokens, takes their fill colour as the palette, then compares the
coloured pixels of every activity illustration to that palette with CIEDE2000.

Beige token backgrounds, black outlines, and neutral skin or cardboard tones
are left out. A pixel can contribute to only its nearest phase, and an
activity may score highly on more than one phase. Scores do not need to sum
to 1.

The result is a cache. The app does not inspect pixels at runtime.

Run from the repository root:

    python3 scripts/analyse-activity-colours.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOKEN_DIR = ROOT / "public" / "tokens"
OUT_PATH = ROOT / "src" / "data" / "phaseColourCache.ts"

PHASE_ASSETS = {
    "understand": "begrijpen@2x.png",
    "discover": "ontdekken@2x.png",
    "design": "ontwerpen@2x.png",
    "make": "maken@2x.png",
    "share": "delen@2x.png",
}

PHASE_ORDER = ["understand", "discover", "design", "make", "share"]

# Structural pieces and other non-activity tokens that share the folder.
EXCLUDED = {
    "vertrekpunt@2x.png": "starting-point",
    "eindpunt@2x.png": "endpoint",
    "checkpunt@2x.png": "checkpoint",
    "blanco@2x.png": "blank",
    "blanco_1@2x.png": "blank",
    "herhaal@2x.png": "repeat-marker",
    "groowy@2x.png": "mascot",
    "blij@2x.png": "emotion",
    "boos@2x.png": "emotion",
    "content@2x.png": "emotion",
    "easy@2x.png": "emotion",
    "geintereseerd@2x.png": "emotion",
    "verbaasd@2x.png": "emotion",
    "verdrietig@2x.png": "emotion",
    "verward@2x.png": "emotion",
}

# CIEDE2000 distance at which a solid pixel no longer counts as a phase colour.
# Tight enough that wood, cardboard, and the shared peach skin tone fall outside
# the orange phase, while the vivid phase fills stay inside.
MAX_DISTANCE = 13.0
# Pastel tints are lighter than the phase fill. They match on hue instead.
PASTEL_HUE_DEGREES = 22.0
PASTEL_WEIGHT = 0.55
# Shared skin / wood peach used across the illustrations. It sits near Make
# in RGB but it is a neutral drawing colour, not a phase indicator.
NEUTRAL_PEACH = ((224, 160, 112), (224, 160, 128))
PEACH_DISTANCE = 9.0
# Fraction of illustration mass that saturates a phase score at 1.
# A second colour can still reach 1, so scores do not sum to 1.
SCORE_AT = 0.30
# Matched mass below this fraction is treated as edge noise.
NOISE_FRACTION = 0.04
# If every phase stays under this score, the reading is unknown.
UNKNOWN_BELOW = 0.20


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB 0–255, shape (N, 3), to CIE L*a*b* under D65."""
    channel = rgb / 255.0
    linear = np.where(channel <= 0.04045, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)
    matrix = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = linear @ matrix.T
    white = np.array([0.95047, 1.0, 1.08883])
    scaled = xyz / white
    delta = 6 / 29
    f = np.where(scaled > delta**3, np.cbrt(scaled), scaled / (3 * delta**2) + 4 / 29)
    lightness = 116 * f[:, 1] - 16
    a_axis = 500 * (f[:, 0] - f[:, 1])
    b_axis = 200 * (f[:, 1] - f[:, 2])
    return np.stack([lightness, a_axis, b_axis], axis=1)


def delta_e2000(reference: np.ndarray, samples: np.ndarray) -> np.ndarray:
    """CIEDE2000 distance from one Lab colour to many samples."""
    lightness_1, a_1, b_1 = (float(reference[0]), float(reference[1]), float(reference[2]))
    lightness_2 = samples[:, 0]
    a_2 = samples[:, 1]
    b_2 = samples[:, 2]

    chroma_1 = np.hypot(a_1, b_1)
    chroma_2 = np.hypot(a_2, b_2)
    chroma_bar = (chroma_1 + chroma_2) / 2
    chroma_bar_7 = chroma_bar**7
    gravity = 0.5 * (1 - np.sqrt(chroma_bar_7 / (chroma_bar_7 + 25**7)))

    a1_prime = (1 + gravity) * a_1
    a2_prime = (1 + gravity) * a_2
    chroma1_prime = np.hypot(a1_prime, b_1)
    chroma2_prime = np.hypot(a2_prime, b_2)

    hue1 = np.degrees(np.arctan2(b_1, a1_prime)) % 360
    hue2 = np.degrees(np.arctan2(b_2, a2_prime)) % 360

    delta_lightness = lightness_2 - lightness_1
    delta_chroma = chroma2_prime - chroma1_prime
    delta_hue = hue2 - hue1
    delta_hue = np.where(delta_hue > 180, delta_hue - 360, delta_hue)
    delta_hue = np.where(delta_hue < -180, delta_hue + 360, delta_hue)
    delta_hue = np.where((chroma1_prime * chroma2_prime) == 0, 0, delta_hue)
    delta_big_h = 2 * np.sqrt(chroma1_prime * chroma2_prime) * np.sin(np.radians(delta_hue) / 2)

    lightness_bar = (lightness_1 + lightness_2) / 2
    chroma_prime_bar = (chroma1_prime + chroma2_prime) / 2
    hue_sum = hue1 + hue2
    hue_bar = np.where(
        np.abs(hue1 - hue2) > 180,
        np.where(hue_sum < 360, (hue_sum + 360) / 2, (hue_sum - 360) / 2),
        hue_sum / 2,
    )
    hue_bar = np.where((chroma1_prime * chroma2_prime) == 0, hue_sum, hue_bar)

    turning = (
        1
        - 0.17 * np.cos(np.radians(hue_bar - 30))
        + 0.24 * np.cos(np.radians(2 * hue_bar))
        + 0.32 * np.cos(np.radians(3 * hue_bar + 6))
        - 0.20 * np.cos(np.radians(4 * hue_bar - 63))
    )
    theta = 30 * np.exp(-((hue_bar - 275) / 25) ** 2)
    chroma_prime_7 = chroma_prime_bar**7
    rotation_c = 2 * np.sqrt(chroma_prime_7 / (chroma_prime_7 + 25**7))
    scale_l = 1 + (0.015 * (lightness_bar - 50) ** 2) / np.sqrt(20 + (lightness_bar - 50) ** 2)
    scale_c = 1 + 0.045 * chroma_prime_bar
    scale_h = 1 + 0.015 * chroma_prime_bar * turning
    rotation_t = -np.sin(np.radians(2 * theta)) * rotation_c

    return np.sqrt(
        (delta_lightness / scale_l) ** 2
        + (delta_chroma / scale_c) ** 2
        + (delta_big_h / scale_h) ** 2
        + rotation_t * (delta_chroma / scale_c) * (delta_big_h / scale_h)
    )


def check_delta_e() -> None:
    """Sharma, Wu, Dalal (2005) worked example, pair 1."""
    distance = float(
        delta_e2000(
            np.array([50.0, 2.6772, -79.7751]),
            np.array([[50.0, 0.0, -82.7485]]),
        )[0]
    )
    if abs(distance - 2.0425) > 0.001:
        raise SystemExit(f"CIEDE2000 self-check failed: {distance}")
    same = float(delta_e2000(np.array([40.0, 20.0, 10.0]), np.array([[40.0, 20.0, 10.0]]))[0])
    if same > 1e-6:
        raise SystemExit(f"CIEDE2000 identity check failed: {same}")


def load_rgba(path: Path, step: int) -> tuple[np.ndarray, np.ndarray]:
    image = Image.open(path).convert("RGBA")
    pixels = np.asarray(image)
    if step > 1:
        pixels = pixels[::step, ::step]
    flat = pixels.reshape(-1, 4)
    rgb = flat[:, :3].astype(np.float64)
    alpha = flat[:, 3].astype(np.float64)
    return rgb, alpha


def hsv_arrays(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    red, green, blue = rgb[:, 0] / 255, rgb[:, 1] / 255, rgb[:, 2] / 255
    peak = np.maximum(np.maximum(red, green), blue)
    floor = np.minimum(np.minimum(red, green), blue)
    span = peak - floor
    saturation = np.where(peak == 0, 0, span / np.maximum(peak, 1e-8))
    hue = np.zeros(len(rgb))
    mask = span > 1e-8
    r_dom = mask & (peak == red)
    g_dom = mask & (peak == green)
    b_dom = mask & (peak == blue)
    hue[r_dom] = ((green[r_dom] - blue[r_dom]) / span[r_dom]) % 6
    hue[g_dom] = ((blue[g_dom] - red[g_dom]) / span[g_dom]) + 2
    hue[b_dom] = ((red[b_dom] - green[b_dom]) / span[b_dom]) + 4
    return hue * 60, saturation, peak


def hex_of(rgb: np.ndarray) -> str:
    red, green, blue = (int(round(channel)) for channel in rgb)
    return f"#{red:02X}{green:02X}{blue:02X}"


def phase_palette() -> dict[str, dict[str, object]]:
    palette: dict[str, dict[str, object]] = {}
    for phase, asset in PHASE_ASSETS.items():
        rgb, alpha = load_rgba(TOKEN_DIR / asset, step=1)
        lab = rgb_to_lab(rgb)
        lightness = lab[:, 0]
        chroma = np.hypot(lab[:, 1], lab[:, 2])
        # The fill, not the cream border or the black stroke.
        chosen = (alpha > 220) & (lightness > 42) & (lightness < 78) & (chroma > 38)
        if int(chosen.sum()) < 50:
            chosen = (alpha > 220) & (lightness > 35) & (chroma > 28)
        sample_rgb = rgb[chosen]
        sample_lab = lab[chosen]
        median_rgb = np.median(sample_rgb, axis=0)
        median_lab = np.median(sample_lab, axis=0)
        palette[phase] = {
            "asset": asset,
            "hex": hex_of(median_rgb),
            "lab": [round(float(value), 2) for value in median_lab],
            "sampledPixels": int(chosen.sum()),
        }
        print(f"palette {phase:12} {palette[phase]['hex']}  pixels {chosen.sum()}")
    return palette


def illustration_mask(rgb: np.ndarray, alpha: np.ndarray, lab: np.ndarray) -> np.ndarray:
    lightness = lab[:, 0]
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    hue, saturation, value = hsv_arrays(rgb)
    opaque = alpha > 190
    outline = lightness < 32
    paper_white = (lightness > 93) & (chroma < 14)
    # Common pentagon fill: warm, pale, low chroma.
    beige = (lightness > 78) & (chroma < 24) & (lab[:, 2] > -2) & (np.abs(lab[:, 1]) < 14)
    gray = chroma < 12
    return opaque & ~outline & ~paper_white & ~beige & ~gray, hue, saturation, value, chroma


def hue_delta(left: np.ndarray, right: float) -> np.ndarray:
    delta = np.abs(left - right) % 360
    return np.minimum(delta, 360 - delta)


def analyse_activity(asset: str, palette_lab: dict[str, np.ndarray], phase_hue: dict[str, float], peach_lab: list[np.ndarray]) -> dict[str, object]:
    rgb, alpha = load_rgba(TOKEN_DIR / asset, step=2)
    lab = rgb_to_lab(rgb)
    keep, hue, _saturation, _value, chroma = illustration_mask(rgb, alpha, lab)
    if int(keep.sum()) < 8:
        return empty_profile(asset, "too-little-colour")

    kept_lab = lab[keep]
    kept_hue = hue[keep]
    kept_chroma = chroma[keep]
    kept_lightness = kept_lab[:, 0]
    peach_distance = np.min(np.stack([delta_e2000(peach, kept_lab) for peach in peach_lab], axis=1), axis=1)
    usable = peach_distance > PEACH_DISTANCE
    if int(usable.sum()) < 8:
        return empty_profile(asset, "only-neutral-colour")

    distances = np.stack(
        [delta_e2000(palette_lab[phase], kept_lab) for phase in PHASE_ORDER],
        axis=1,
    )
    nearest = distances.argmin(axis=1)
    closest = distances.min(axis=1)
    solid = usable & (closest <= MAX_DISTANCE)

    hue_distance = np.stack(
        [hue_delta(kept_hue, phase_hue[phase]) for phase in PHASE_ORDER],
        axis=1,
    )
    pastel_nearest = hue_distance.argmin(axis=1)
    pastel_gap = hue_distance.min(axis=1)
    pastel = (
        usable
        & ~solid
        & (kept_lightness >= 62)
        & (kept_chroma >= 14)
        & (kept_chroma <= 48)
        & (pastel_gap <= PASTEL_HUE_DEGREES)
    )

    sat_weight = np.clip(kept_chroma / 42.0, 0.3, 1.0)
    illustration_mass = float(sat_weight[usable].sum())
    closeness = np.clip(1 - closest / MAX_DISTANCE, 0, 1)
    pastel_closeness = np.clip(1 - pastel_gap / PASTEL_HUE_DEGREES, 0, 1) * PASTEL_WEIGHT

    associations: dict[str, float] = {}
    fractions: dict[str, float] = {}
    for index, phase in enumerate(PHASE_ORDER):
        solid_mass = float((sat_weight * closeness)[solid & (nearest == index)].sum())
        pastel_mass = float((sat_weight * pastel_closeness)[pastel & (pastel_nearest == index)].sum())
        fraction = (solid_mass + pastel_mass) / illustration_mass if illustration_mass else 0.0
        if fraction < NOISE_FRACTION:
            fraction = 0.0
        fractions[phase] = round(fraction, 4)
        associations[phase] = round(min(1.0, fraction / SCORE_AT), 3)

    strongest = max(associations.values())
    source = "colour-inferred" if strongest >= UNKNOWN_BELOW else "unknown"
    if source == "unknown":
        associations = {phase: 0.0 for phase in PHASE_ORDER}
    return {
        "asset": asset,
        "associationSource": source,
        "phaseAssociations": associations,
        "matchedFraction": fractions,
        "illustrationPixels": int(usable.sum()),
    }


def empty_profile(asset: str, reason: str) -> dict[str, object]:
    return {
        "asset": asset,
        "associationSource": "unknown",
        "phaseAssociations": {phase: 0.0 for phase in PHASE_ORDER},
        "matchedFraction": {phase: 0.0 for phase in PHASE_ORDER},
        "illustrationPixels": 0,
        "note": reason,
    }


def discover_assets() -> list[str]:
    names = sorted(path.name for path in TOKEN_DIR.glob("*@2x.png"))
    phase_files = set(PHASE_ASSETS.values())
    unknown = [
        name
        for name in names
        if name not in phase_files and name not in EXCLUDED
    ]
    missing = [name for name in list(PHASE_ASSETS.values()) + list(EXCLUDED) if name not in names]
    if missing:
        raise SystemExit(f"Expected token files are missing: {missing}")
    return unknown


def emit(payload: dict[str, object]) -> None:
    body = json.dumps(payload, indent=2)
    text = (
        "// Generated by scripts/analyse-activity-colours.py\n"
        "// Re-run that script after activity artwork changes. Do not edit by hand.\n"
        "//\n"
        "// Phase scores are provisional colour readings of the illustrations.\n"
        "// They are not official Groow phase classifications. An activity with\n"
        "// no reliable phase colour is marked \"unknown\" and is not given a\n"
        "// fabricated association.\n\n"
        f"export const COLOUR_ANALYSIS = {body} as const;\n"
    )
    OUT_PATH.write_text(text)
    print(f"wrote {OUT_PATH.relative_to(ROOT)}")


def main() -> None:
    check_delta_e()
    palette = phase_palette()
    palette_lab = {
        phase: np.array(palette[phase]["lab"], dtype=np.float64) for phase in PHASE_ORDER
    }
    phase_hue = {}
    for phase in PHASE_ORDER:
        hex_colour = str(palette[phase]["hex"]).lstrip("#")
        sample = np.array(
            [[int(hex_colour[0:2], 16), int(hex_colour[2:4], 16), int(hex_colour[4:6], 16)]],
            dtype=np.float64,
        )
        phase_hue[phase] = float(hsv_arrays(sample)[0][0])
    peach_lab = [rgb_to_lab(np.array([colour], dtype=np.float64))[0] for colour in NEUTRAL_PEACH]
    assets = discover_assets()
    profiles = [analyse_activity(asset, palette_lab, phase_hue, peach_lab) for asset in assets]
    unknown = [item["asset"] for item in profiles if item["associationSource"] == "unknown"]
    print(f"activities {len(profiles)}  unknown {len(unknown)}")
    for profile in profiles:
        associations = profile["phaseAssociations"]
        parts = [
            f"{phase[:3]} {associations[phase]:.2f}"
            for phase in PHASE_ORDER
            if associations[phase] >= 0.15
        ]
        flag = "UNKNOWN" if profile["associationSource"] == "unknown" else "colour"
        print(f"  {flag:7} {profile['asset']:36} {', '.join(parts) or '—'}")

    payload = {
        "method": "CIEDE2000 against phase-token fills",
        "associationSourceNote": "colour-inferred scores are provisional. No official phase table was found in the project.",
        "parameters": {
            "maxDistance": MAX_DISTANCE,
            "scoreSaturation": SCORE_AT,
            "noiseFraction": NOISE_FRACTION,
            "unknownBelow": UNKNOWN_BELOW,
        },
        "palette": palette,
        "excluded": [{"asset": asset, "reason": reason} for asset, reason in sorted(EXCLUDED.items())],
        "phaseAssets": PHASE_ASSETS,
        "profiles": {profile["asset"]: profile for profile in profiles},
    }
    emit(payload)


if __name__ == "__main__":
    main()
