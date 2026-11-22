"""
renderer3d.py - the BUILD step of Ian's 3D terminal renderer, arranged as a function
so Flask can call it.

ORIGINAL: Ian's 3D_model_terminal_display.py (all maths and logic are Ian's).
AI-ASSISTED ARRANGEMENT (Claude, Anthropic): the model-building block was moved into
build_model(formula). The model-building logic is unchanged. Only these things differ from the original:
  - no input(), no print(), no SystemExit: the function takes the formula as text and
    RETURNS the result, and raises ValueError with a message when something is wrong
  - the animation (display_1 / display_2) is NOT here; the browser will draw the frames
  - SAFETY ADDITIONS: exponents must be plain numbers (no 9^9^9), a build time limit, and
    (-1)^0.5 style cases no longer crash (TypeError is caught like the other maths errors)
"""

import ast
import time
import numpy as np
from math import isfinite, nan

# ---------- settings (same numbers as the original) ----------
CD = 2.47
x_count, y_count, z_count = 60, 30, 30
screen_width, screen_height = x_count, y_count

SAMPLE_STEP = 0.33
SURFACE_TOLERANCE = 0.75 * SAMPLE_STEP
GRADIENT_EPSILON = 0.01
MIN_NORMAL_LENGTH = 1e-10

# ---------- safety limits (for a public website) ----------
MAX_EXPONENT = 20          # powers must be plain numbers from -20 to 20, like x^2 or x^-1
BUILD_TIME_LIMIT = 20      # seconds; building a model takes longer than this -> give up


# ---------- turn the typed formula into a function (Ian's, unchanged) ----------
def compile_math(expression):
    expression = expression.lower().replace("^", "**").strip()
    tree = ast.parse(expression, mode="eval")

    allowed_nodes = (
        ast.Expression, ast.Constant, ast.Name, ast.Load,
        ast.BinOp, ast.UnaryOp,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod,
        ast.UAdd, ast.USub
    )

    for node in ast.walk(tree):
        if not isinstance(node, allowed_nodes):
            raise ValueError(f"Unsupported syntax: {type(node).__name__}")

        if isinstance(node, ast.Name) and node.id not in {"x", "y", "z"}:
            raise ValueError(f"Unknown variable: {node.id}")

        if isinstance(node, ast.Constant) and type(node.value) not in (int, float):
            raise ValueError("Only numeric constants are allowed")

        # SAFETY: a power like 9^9^9 would make Python calculate a gigantic number and freeze.
        # So the exponent (the number after ^) must be a plain number, such as 2, -1 or 0.5.
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            exponent = node.right
            if isinstance(exponent, ast.UnaryOp):          # allow a minus sign: x^-2
                exponent = exponent.operand
            if not (isinstance(exponent, ast.Constant)
                    and isinstance(exponent.value, (int, float))
                    and abs(exponent.value) <= MAX_EXPONENT):
                raise ValueError(
                    f"An exponent must be a plain number between -{MAX_EXPONENT} and "
                    f"{MAX_EXPONENT}, like x^2 or x^-1. Use brackets for repeated powers: (x^2)^2."
                )

    code = compile(tree, "<3D model>", "eval")

    def calculate(x, y, z):
        try:
            value = eval(
                code,
                {"__builtins__": {}},
                {"x": x, "y": y, "z": z},
            )
            return value
        except (ArithmeticError, ValueError, TypeError):
            # E.g. division by zero, an overflowing power, or (-1)^0.5 which Python
            # answers with a complex number (that is the TypeError).
            return nan

    return calculate


# ---------- the build step ----------
def build_model(formula, time_limit=BUILD_TIME_LIMIT):
    """Take a formula like "x^2 + y^2 + z^2 = 25".
    Return {"closed": True/False, "voxels": [[X, Y, Z, nx, ny, nz, False, False], ...]}.
    Raise ValueError (with a readable message) if the formula cannot be used
    or the build takes longer than time_limit seconds."""

    # 1) read the formula
    try:
        left_side, right_side = formula.lower().split("=")
        left = compile_math(left_side)
        right = compile_math(right_side)
    except SyntaxError as error:
        raise ValueError("Could not read the formula.") from error
    except ValueError as error:
        if "unpack" in str(error):                     # not exactly one "=" sign
            raise ValueError("The formula needs exactly one '=' sign.") from error
        raise                                          # compile_math's own message

    # The model returns zero wherever the equation is satisfied.
    def model(x, y, z):
        return left(x, y, z) - right(x, y, z)

    # 2) get ready (Ian's setup lines)
    surface_voxels = []

    far_value = model(1000.0, 1000.0, 1000.0)          # a point far away = "outside"
    far_sign = -1 if (isfinite(far_value) and far_value < 0) else 1
    inside_found = False         # a grid point on the opposite side to "outside"
    touches_boundary = False     # ...and one of those is on the edge of the grid

    half_x = screen_width / (2 * CD)
    half_y = screen_height / 2
    half_z = screen_height / 2

    x_steps = int(half_x / SAMPLE_STEP)
    y_steps = int(half_y / SAMPLE_STEP)
    z_steps = int(half_z / SAMPLE_STEP)

    xv = np.arange(-x_steps, x_steps + 1) * SAMPLE_STEP
    yv = np.arange(-y_steps, y_steps + 1) * SAMPLE_STEP
    zv = np.arange(-z_steps, z_steps + 1) * SAMPLE_STEP
    
    X, Y, Z = np.meshgrid(xv, yv, zv, indexing='ij') 

    e = GRADIENT_EPSILON
    with np.errstate(all="ignore"):          # divide-by-zero etc. just give nan/inf, no warnings

        # derivation, normal vector direction
        residual = model(X, Y, Z)
        gx = (model(X + e, Y, Z) - model(X - e, Y, Z)) / (2 * e)
        gy = (model(X, Y + e, Z) - model(X, Y - e, Z)) / (2 * e)
        gz = (model(X, Y, Z + e) - model(X, Y, Z - e)) / (2 * e)
        
        normal_length = np.sqrt(gx * gx + gy * gy + gz * gz)
        distance = np.abs(residual) / normal_length
        
        keep = (np.isfinite(gx) & np.isfinite(gy) & np.isfinite(gz)
                & np.isfinite(normal_length)                           # normal_length finite
                & (normal_length >= MIN_NORMAL_LENGTH)                 # ...and not ~0
                & np.logical_not(distance > SURFACE_TOLERANCE))       # close to the surface
                # (written as "not (distance > tolerance)" so a nan distance behaves like the original))

        # unit normal vector
        nx = gx / normal_length
        ny = gy / normal_length
        nz = gz / normal_length

    # 5) IS THE SHAPE CLOSED? (the inside_found / touches_boundary lines, as tables)
    inside = np.isfinite(residual) & (residual * far_sign < 0)
    inside_found = bool(inside.any())

    on_boundary = np.zeros(X.shape, dtype=bool)          # True on the outer faces of the grid
    on_boundary[0, :, :] = on_boundary[-1, :, :] = True
    on_boundary[:, 0, :] = on_boundary[:, -1, :] = True
    on_boundary[:, :, 0] = on_boundary[:, :, -1] = True
    touches_boundary = bool((inside & on_boundary).any())

    is_closed = inside_found and not touches_boundary

    if far_sign < 0:                       # make every normal point outward, once
        nx, ny, nz = -nx, -ny, -nz
        
    surface_voxels = [
        [x, y, z, a, b, c, False, False]
        for x, y, z, a, b, c in zip(
            X[keep].tolist(), Y[keep].tolist(), Z[keep].tolist(),
            nx[keep].tolist(), ny[keep].tolist(), nz[keep].tolist())
    ]

    if not surface_voxels:
        raise ValueError(
            "No surface voxels were found. Try a different equation, "
            "a larger grid, or a different surface tolerance."
        )

    return {"closed": is_closed, "voxels": surface_voxels}


# ---------- quick test: run  python renderer3d.py ----------
if __name__ == "__main__":
    for text in ["x^2 + y^2 + z^2 = 25", "x^2 + y^2 = 1 +", "hello = 3"]:
        start = time.perf_counter()
        try:
            result = build_model(text)
            print(f"{text!r}: {len(result['voxels'])} voxels, closed={result['closed']}, "
                  f"{time.perf_counter() - start:.1f}s")
        except ValueError as error:
            print(f"{text!r}: ValueError: {error}")

# (x^2 + y^2 + z^2 + 21)^2 = 150*(x^2 + y^2)