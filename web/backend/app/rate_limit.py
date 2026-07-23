from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class Bucket:
    window_start_s: int
    count: int


_buckets: dict[str, Bucket] = {}


def allow_request(*, key: str, rpm_limit: int) -> bool:
    """
    Simple fixed-window RPM limiter in memory.
    Good enough for single-instance dev; replace with Redis for multi-instance.
    """
    if rpm_limit <= 0:
        return True
    now_s = int(time.time())
    window = now_s // 60
    b = _buckets.get(key)
    if not b or b.window_start_s != window:
        _buckets[key] = Bucket(window_start_s=window, count=1)
        return True
    if b.count >= rpm_limit:
        return False
    b.count += 1
    return True

