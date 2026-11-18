import pytest

from app.utils.check_str import fix_wrong_result


def test_positive(positive_case):
    input_text, expected_result = positive_case
    assert fix_wrong_result(input_text) == expected_result


def test_negative(negative_case):
    input_text, expected_message = negative_case
    with pytest.raises(ValueError) as exc_info:
        fix_wrong_result(input_text)
    assert str(exc_info.value) == expected_message


@pytest.mark.parametrize("input_value", [None, 123, b"1/2"])
def test_rejects_non_string_input(input_value):
    with pytest.raises(ValueError) as exc_info:
        fix_wrong_result(input_value)
    assert str(exc_info.value) == "Входное значение должно быть строкой"


def test_rejects_very_long_integer():
    with pytest.raises(ValueError) as exc_info:
        fix_wrong_result(f"{'9' * 5000}/1")
    assert str(exc_info.value) == "Первое число должно быть не больше 2147483647"


def test_preserves_leading_zeros_in_valid_integer():
    fraction = f"{'0' * 5000}1/2"
    assert fix_wrong_result(fraction) == fraction


def test_random_less_than(random_less_than):
    input_text, expected_result = random_less_than
    assert fix_wrong_result(input_text) == expected_result


def test_random_equal(random_equal):
    input_text, expected_result = random_equal
    assert fix_wrong_result(input_text) == expected_result


def test_random_greater_than(random_greater_than):
    input_text, expected_result = random_greater_than
    assert fix_wrong_result(input_text) == expected_result
