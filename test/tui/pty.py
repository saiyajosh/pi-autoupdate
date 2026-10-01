"""POSIX PTY bridge: stdin is JSON control messages; stdout is terminal bytes."""
import base64
import errno
import fcntl
import json
import os
import select
import signal
import struct
import sys
import termios


def resize(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


pid, master = os.forkpty()
if pid == 0:
    resize(0, 120, 40)
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)

# A termination request must still run cleanup below, including child processes.
signal.signal(signal.SIGTERM, lambda _signal, _frame: sys.exit(0))

pending = b""
try:
    while True:
        ready, _, _ = select.select([master, sys.stdin.buffer], [], [], 1)
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if sys.stdin.buffer in ready:
            data = os.read(sys.stdin.fileno(), 65536)
            if not data:
                break
            pending += data
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                command = json.loads(line)
                if "input" in command:
                    os.write(master, base64.b64decode(command["input"]))
                elif "resize" in command:
                    resize(master, *command["resize"])
finally:
    # The child owns a fresh process group. Kill any descendants as well.
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    os.close(master)
    os.waitpid(pid, 0)
