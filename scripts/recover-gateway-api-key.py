#!/usr/bin/env python3
"""Recover API_SERVER_KEY from the live Hermes Gateway process.

Writes the key to stdout only. Never logs or prints it on stderr.
Exit 1 with a non-secret message if recovery fails.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import struct
import subprocess
import sys
from typing import Dict, Iterable, Optional

CTL_KERN = 1
KERN_PROCARGS2 = 49


def _fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def listener_pids(host: str, port: int) -> list[int]:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    pids: list[int] = []
    wanted = (f"{host}:{port}", f"*:{port}", f"localhost:{port}")
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 9:
            continue
        name = parts[8]
        if name not in wanted and not name.endswith(f":{port}"):
            continue
        try:
            pid = int(parts[1])
        except ValueError:
            continue
        if pid not in pids:
            pids.append(pid)
    return pids


def _sysctl_procargs2(pid: int) -> bytes:
    libc_name = ctypes.util.find_library("c") or "/usr/lib/libSystem.B.dylib"
    libc = ctypes.CDLL(libc_name, use_errno=True)
    mib = (ctypes.c_int * 3)(CTL_KERN, KERN_PROCARGS2, int(pid))
    size = ctypes.c_size_t(0)
    if libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0) < 0:
        raise OSError(ctypes.get_errno() or 1, "sysctl size")
    buf = ctypes.create_string_buffer(size.value)
    if libc.sysctl(mib, 3, buf, ctypes.byref(size), None, 0) < 0:
        raise OSError(ctypes.get_errno() or 1, "sysctl read")
    return bytes(buf.raw[: size.value])


def environ_for_pid(pid: int) -> Dict[str, str]:
    data = _sysctl_procargs2(pid)
    if len(data) < 4:
        return {}
    argc = struct.unpack_from("i", data, 0)[0]
    rest = data[4:]
    first_nul = rest.find(b"\0")
    if first_nul < 0:
        return {}
    rest = rest[first_nul + 1 :]
    while rest.startswith(b"\0"):
        rest = rest[1:]
    for _ in range(max(argc, 0)):
        nul = rest.find(b"\0")
        if nul < 0:
            return {}
        rest = rest[nul + 1 :]
    env: Dict[str, str] = {}
    while rest:
        nul = rest.find(b"\0")
        if nul < 0:
            break
        item = rest[:nul]
        rest = rest[nul + 1 :]
        if not item:
            break
        if b"=" not in item:
            continue
        key, _, value = item.partition(b"=")
        try:
            name = key.decode("utf-8")
            env[name] = value.decode("utf-8", "replace")
        except UnicodeDecodeError:
            continue
    return env


def first_api_server_key(pids: Iterable[int]) -> Optional[str]:
    for pid in pids:
        try:
            env = environ_for_pid(pid)
        except OSError:
            continue
        value = (env.get("API_SERVER_KEY") or "").strip()
        if value:
            return value
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8642)
    parser.add_argument("--pid", type=int, default=0)
    args = parser.parse_args(argv)

    if args.pid > 0:
        pids = [args.pid]
        source = "pid"
    else:
        pids = listener_pids(args.host, args.port)
        source = "listener"

    if not pids:
        _fail(f"gateway is not listening on {args.host}:{args.port}")

    key = first_api_server_key(pids)
    if key is None:
        if source == "listener":
            _fail("gateway API_SERVER_KEY could not be recovered from the live process")
        _fail("API_SERVER_KEY could not be recovered from the given process")
    if not key.strip():
        _fail("gateway API_SERVER_KEY is blank")

    sys.stdout.write(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
