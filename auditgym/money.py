"""Money, FX and time helpers (D-04, D-05, D-18, policy fx_conversion). Owner: Aibek.

All currencies use exponent 2, so `minor * rate` gives KZT minor units directly.
Money is always `int` minor units; rates are `Decimal`; no floats.
"""

from __future__ import annotations

import bisect
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal


def round_half_up(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def convert(amount_minor: int, rate: Decimal) -> int:
    return round_half_up(Decimal(amount_minor) * rate)


def prorate(total_minor: int, part: int, whole: int) -> int:
    """total * part / whole, rounded half-up (pro-rata AR relief of a foreign invoice)."""
    return round_half_up(Decimal(total_minor) * Decimal(part) / Decimal(whole))


def fx_key(day: date, source: str, target: str = "KZT") -> str:
    """Public id of an fx row (D-19)."""
    return f"{day.isoformat()}:{source}:{target}"


def parse_offset(text: str) -> timezone:
    sign = -1 if text.startswith("-") else 1
    hours, minutes = text.lstrip("+-").split(":")
    return timezone(sign * timedelta(hours=int(hours), minutes=int(minutes)))


def parse_ts(text: str) -> datetime:
    value = datetime.fromisoformat(text)
    if value.tzinfo is None:
        raise ValueError(f"timestamp without offset: {text}")
    return value


def iso(ts: datetime, offset: timezone) -> str:
    return ts.astimezone(offset).isoformat()


class FxTable:
    """Business-day rates; lookups use the last rate on or before the day (policy fx_missing_rate)."""

    def __init__(self, rows):
        # rows: iterable of (date, source, target, Decimal)
        self.rows = sorted(rows, key=lambda r: (r[0], r[1]))
        self._dates: dict[str, list[date]] = {}
        self._rates: dict[str, list[Decimal]] = {}
        for day, source, _target, rate in sorted(self.rows, key=lambda r: (r[1], r[0])):
            self._dates.setdefault(source, []).append(day)
            self._rates.setdefault(source, []).append(rate)

    @classmethod
    def from_public(cls, rows) -> "FxTable":
        return cls(
            (date.fromisoformat(r["date"]), r["source_currency"], r["target_currency"], Decimal(r["rate"]))
            for r in rows
        )

    def rate_on(self, currency: str, day: date) -> tuple[Decimal, str | None]:
        if currency == "KZT":
            return Decimal(1), None
        dates = self._dates[currency]
        i = bisect.bisect_right(dates, day) - 1
        if i < 0:
            raise KeyError(f"no {currency} rate on or before {day}")
        return self._rates[currency][i], fx_key(dates[i], currency)

    def to_base(self, amount_minor: int, currency: str, day: date) -> int:
        return convert(amount_minor, self.rate_on(currency, day)[0])
