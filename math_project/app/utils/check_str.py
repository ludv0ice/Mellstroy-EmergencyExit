import re


_INTEGER = re.compile(r"[+-]?[0-9]+")
_MAX_INT = 2**31 - 1
_MAX_INT_DIGITS = len(str(_MAX_INT))


def _positive_int(text: str, position: str) -> int:
    digits = text.lstrip("+").lstrip("0")
    if text.startswith("-") or not digits:
        raise ValueError(f"{position} число должно быть положительным")

    # Проверяем длину, чтобы не передавать огромную строку в int().
    if len(digits) <= _MAX_INT_DIGITS:
        value = int(digits)
        if value <= _MAX_INT:
            return value
    raise ValueError(f"{position} число должно быть не больше {_MAX_INT}")


def fix_wrong_result(input_text: str) -> str:
    """Проверяет дробь, удаляет пробелы вокруг чисел и ограничивает N значением M."""
    if not isinstance(input_text, str):
        raise ValueError("Входное значение должно быть строкой")
    if not input_text.strip():
        raise ValueError("Строка не может быть пустой")

    parts = input_text.split("/", maxsplit=2)
    if len(parts) != 2:
        raise ValueError("Строка должна содержать ровно один разделитель '/'")

    first, second = (part.strip() for part in parts)
    if not first or not second:
        raise ValueError("Оба числа должны быть указаны")

    errors = [
        f"'{part}' не является корректным целым числом"
        for part in (first, second)
        if not _INTEGER.fullmatch(part)
    ]
    if errors:
        raise ValueError(", ".join(errors))

    numerator = _positive_int(first, "Первое")
    denominator = _positive_int(second, "Второе")
    if numerator > denominator:
        first = second
    return f"{first}/{second}"
