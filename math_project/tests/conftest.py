import csv
import random
from pathlib import Path

import pytest


DATA_DIR = Path(__file__).parent / "data"


def _load_cases(filename: str, expected_column: str):
    with (DATA_DIR / filename).open(encoding="utf-8-sig", newline="") as file:
        rows = csv.DictReader(file, delimiter=";")
        return [
            pytest.param((row["input_text"], row[expected_column]), id=repr(row["input_text"]))
            for row in rows
        ]


@pytest.fixture(scope="session", params=_load_cases("positive_cases.csv", "expected_result"))
def positive_case(request):
    return request.param


@pytest.fixture(scope="session", params=_load_cases("negative_cases.csv", "expected_message"))
def negative_case(request):
    return request.param


@pytest.fixture
def random_less_than():
    denominator = random.randint(2, 1000)
    numerator = random.randint(1, denominator - 1)
    fraction = f"{numerator}/{denominator}"
    return fraction, fraction


@pytest.fixture
def random_equal():
    number = random.randint(1, 1000)
    fraction = f"{number}/{number}"
    return fraction, fraction


@pytest.fixture
def random_greater_than():
    denominator = random.randint(1, 999)
    numerator = random.randint(denominator + 1, 1000)
    return f"{numerator}/{denominator}", f"{denominator}/{denominator}"
