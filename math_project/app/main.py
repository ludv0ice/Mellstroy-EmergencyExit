import sys

from app.utils import fix_wrong_result


def main() -> None:
    examples = sys.argv[1:] or ["1/10", "251/100", "-10/10", " 9 / 10 "]
    for input_text in examples:
        try:
            result = fix_wrong_result(input_text)
        except ValueError as error:
            print(f"{input_text!r} → ValueError ({error})")
        else:
            print(f"{input_text!r} → {result!r}")


if __name__ == "__main__":
    main()
