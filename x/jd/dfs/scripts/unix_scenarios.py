#!/usr/bin/env python3
import fcntl
import concurrent.futures
import argparse
import errno
import json
import mmap
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time
import unittest

parser = argparse.ArgumentParser()
parser.add_argument('mount_a', type=pathlib.Path)
parser.add_argument('mount_b', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
records = []


def wait_for(predicate, timeout_seconds=5):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError('visibility deadline exceeded')


def close_allow_stale(fd):
    try:
        os.close(fd)
    except OSError as error:
        if error.errno != errno.ESTALE:
            raise


class UnixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_a = pathlib.Path(tempfile.mkdtemp(prefix='unix-', dir=args.mount_a / 'files'))
        cls.root_b = args.mount_b / 'files' / cls.root_a.name
        wait_for(cls.root_b.is_dir)

    def test_parallel_reads_and_publications_make_progress(self):
        payload = bytes(range(256)) * 512
        files = [self.a / f'reader-{i}' for i in range(16)]
        for path in files:
            path.write_bytes(payload)
        control = self.a / 'control'
        control.write_bytes(b'initial')
        barrier = threading.Barrier(17)

        def read_many(path):
            barrier.wait(timeout=10)
            for _ in range(20):
                self.assertEqual(path.read_bytes(), payload)

        def publish_many():
            barrier.wait(timeout=10)
            for index in range(20):
                control.write_bytes(str(index).encode())
                self.assertEqual(control.read_bytes(), str(index).encode())

        with concurrent.futures.ThreadPoolExecutor(max_workers=17) as pool:
            futures = [pool.submit(read_many, path) for path in files]
            futures.append(pool.submit(publish_many))
            for future in futures:
                future.result(timeout=20)

    def setUp(self):
        self.started = time.perf_counter_ns()
        self.a = self.root_a / self._testMethodName
        self.b = self.root_b / self._testMethodName
        self.a.mkdir()
        wait_for(self.b.is_dir)

    def tearDown(self):
        records.append({'test': self._testMethodName, 'elapsed_ms': (time.perf_counter_ns() - self.started) / 1e6})

    def test_shell_copy_rename_replace_and_directory_fsync(self):
        subprocess.run(['sh', '-c', 'printf first > "$1/source"; cp "$1/source" "$1/copy"; printf old > "$1/dest"; mv "$1/copy" "$1/dest"', 'sh', str(self.a)], check=True)
        self.assertEqual((self.a / 'dest').read_bytes(), b'first')
        self.assertFalse((self.a / 'copy').exists())
        fd = os.open(self.a, os.O_RDONLY | os.O_DIRECTORY)
        os.fsync(fd)
        os.close(fd)
        wait_for(lambda: (self.b / 'dest').exists() and (self.b / 'dest').read_bytes() == b'first')

    def test_truncate_append_and_fsync_visibility(self):
        path = self.a / 'file'
        path.write_bytes(b'abcdef')
        fd = os.open(path, os.O_RDWR | os.O_TRUNC)
        self.assertEqual(os.fstat(fd).st_size, 0)
        os.write(fd, b'one')
        os.fsync(fd)
        os.close(fd)
        fd = os.open(path, os.O_WRONLY | os.O_APPEND)
        os.write(fd, b'two')
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, b'three')
        os.fdatasync(fd)
        os.close(fd)
        self.assertEqual(path.read_bytes(), b'onetwothree')
        started = time.perf_counter_ns()
        wait_for(lambda: (self.b / 'file').exists() and (self.b / 'file').read_bytes() == b'onetwothree')
        records.append({'measurement': 'fsync_to_observed_ms', 'value': (time.perf_counter_ns() - started) / 1e6})

    def test_same_base_writers_and_stale_handle(self):
        path = self.a / 'file'
        path.write_bytes(b'initial')
        wait_for(lambda: (self.b / 'file').exists())
        fds = [os.open(path, os.O_RDWR), os.open(self.b / 'file', os.O_RDWR)]
        barrier = threading.Barrier(2)
        outcomes = []
        def publish(index):
            barrier.wait()
            try:
                outcomes.append(('ok', os.write(fds[index], b'A' if index == 0 else b'B')))
            except OSError as error:
                outcomes.append(('error', error.errno))
        threads = [threading.Thread(target=publish, args=(index,)) for index in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(sorted(outcomes), [('error', errno.ESTALE), ('ok', 1)])
        for fd in fds:
            close_allow_stale(fd)
        (self.a / 'unrelated').write_bytes(b'works')

    def test_cached_metadata_tracks_remote_changes(self):
        directory = self.a / 'old'
        directory.mkdir()
        path = directory / 'file'
        path.write_bytes(b'old')
        remote = self.b / 'old' / 'file'
        wait_for(remote.exists)
        inode = remote.stat().st_ino
        self.assertEqual(remote.stat().st_size, 3)
        list(os.scandir(remote.parent))
        path.write_bytes(b'new-longer-value')
        wait_for(lambda: remote.stat().st_size == 16)
        path.chmod(0o600)
        wait_for(lambda: remote.stat().st_mode & 0o777 == 0o600)
        directory.rename(self.a / 'new')
        wait_for(lambda: not (self.b / 'old').exists() and (self.b / 'new' / 'file').exists())
        replacement = self.a / 'new' / 'replacement'
        replacement.write_bytes(b'replaced')
        replacement.replace(self.a / 'new' / 'file')
        remote = self.b / 'new' / 'file'
        wait_for(lambda: remote.stat().st_ino != inode)
        self.assertEqual(remote.read_bytes(), b'replaced')
        for index in range(10):
            inode = remote.stat().st_ino
            replacement.write_bytes(str(index).encode())
            replacement.replace(self.a / 'new' / 'file')
            wait_for(lambda: remote.stat().st_ino != inode)
            self.assertEqual(remote.read_bytes(), str(index).encode())
        (self.a / 'new' / 'file').unlink()
        wait_for(lambda: not remote.exists())

    def test_cached_contents_track_same_size_edits_and_truncation(self):
        path = self.a / 'file'
        remote = self.b / 'file'
        payload = b'A' * (128 * 1024)
        path.write_bytes(payload)
        wait_for(remote.exists)
        with remote.open('rb', buffering=0) as reader:
            self.assertEqual(reader.read(), payload)
            with mmap.mmap(reader.fileno(), len(payload), access=mmap.ACCESS_READ) as mapping:
                self.assertEqual(mapping[:], payload)
                with path.open('r+b', buffering=0) as writer:
                    writer.write(b'B' * len(payload))
                wait_for(lambda: os.pread(reader.fileno(), len(payload), 0) == b'B' * len(payload))
                self.assertEqual(mapping[:], b'B' * len(payload))
            self.assertEqual(remote.read_bytes(), b'B' * len(payload))
            os.truncate(path, 4096)
            wait_for(lambda: os.fstat(reader.fileno()).st_size == 4096)
            self.assertEqual(os.pread(reader.fileno(), len(payload), 0), b'B' * 4096)
            os.truncate(path, len(payload))
            wait_for(lambda: os.fstat(reader.fileno()).st_size == len(payload))
            self.assertEqual(os.pread(reader.fileno(), len(payload), 0), b'B' * 4096 + bytes(len(payload) - 4096))

    def test_cached_contents_track_local_direct_writes(self):
        path = self.a / 'file'
        path.write_bytes(b'A' * 8192)
        with path.open('rb', buffering=0) as reader:
            self.assertEqual(reader.read(), b'A' * 8192)
            with path.open('r+b', buffering=0) as writer:
                writer.seek(4096)
                writer.write(b'B' * 4096)
            self.assertEqual(os.pread(reader.fileno(), 8192, 0), b'A' * 4096 + b'B' * 4096)
            path.write_bytes(b'C' * 8192)
            self.assertEqual(os.pread(reader.fileno(), 8192, 0), b'C' * 8192)

    def test_cached_unlinked_handle_tracks_remote_writes(self):
        path = self.a / 'file'
        remote = self.b / 'file'
        path.write_bytes(b'A' * 8192)
        wait_for(remote.exists)
        with path.open('r+b', buffering=0) as writer, remote.open('rb', buffering=0) as reader:
            self.assertEqual(reader.read(), b'A' * 8192)
            path.unlink()
            wait_for(lambda: not remote.exists())
            self.assertEqual(os.pread(reader.fileno(), 8192, 0), b'A' * 8192)
            writer.write(b'B' * 8192)
            wait_for(lambda: os.pread(reader.fileno(), 8192, 0) == b'B' * 8192)
            writer.truncate(4096)
            wait_for(lambda: os.fstat(reader.fileno()).st_size == 4096)
            self.assertEqual(os.pread(reader.fileno(), 8192, 0), b'B' * 4096)

    def test_cached_directory_listings_track_changes(self):
        self.assertEqual(os.listdir(self.b), [])
        self.assertEqual(os.listdir(self.b), [])
        fd = os.open(self.b, os.O_RDONLY | os.O_DIRECTORY)
        try:
            (self.a / 'first').write_bytes(b'first')
            wait_for(lambda: os.listdir(self.b) == ['first'])
            self.assertEqual(os.listdir(fd), ['first'])
            (self.a / 'first').rename(self.a / 'renamed')
            wait_for(lambda: os.listdir(self.b) == ['renamed'])
            self.assertEqual(os.listdir(fd), ['renamed'])
            (self.a / 'renamed').unlink()
            wait_for(lambda: os.listdir(self.b) == [])
            self.assertEqual(os.listdir(fd), [])
        finally:
            os.close(fd)
        for index in range(100):
            (self.a / f'entry-{index:03}').touch()
        expected = sorted(path.name for path in self.a.iterdir())
        wait_for(lambda: sorted(os.listdir(self.b)) == expected)
        self.assertEqual(sorted(os.listdir(self.b)), expected)
        (self.a / 'entry-050').unlink()
        expected.remove('entry-050')
        self.assertEqual(sorted(os.listdir(self.a)), expected)
        wait_for(lambda: sorted(os.listdir(self.b)) == expected)

    def test_open_unlinked_read_and_write(self):
        path = self.a / 'file'
        path.write_bytes(b'old')
        read_fd = os.open(path, os.O_RDONLY)
        write_fd = os.open(path, os.O_RDWR)
        path.unlink()
        self.assertFalse(path.exists())
        self.assertEqual(os.read(read_fd, 3), b'old')
        os.write(write_fd, b'new')
        os.fsync(write_fd)
        os.lseek(read_fd, 0, os.SEEK_SET)
        self.assertEqual(os.read(read_fd, 3), b'new')
        os.close(read_fd)
        os.close(write_fd)

    def test_reopen_and_temporary_replacement_limits(self):
        path = self.a / 'file'
        path.write_bytes(b'original')
        earlier = path.read_bytes()
        wait_for(lambda: (self.b / 'file').exists())
        (self.b / 'file').write_bytes(b'concurrent')
        wait_for(lambda: path.read_bytes() == b'concurrent')
        path.write_bytes(earlier)
        self.assertEqual(path.read_bytes(), earlier)
        temporary = self.a / 'temporary'
        temporary.write_bytes(b'replacement')
        old_inode = path.stat().st_ino
        os.replace(temporary, path)
        self.assertNotEqual(path.stat().st_ino, old_inode)
        self.assertEqual(path.read_bytes(), b'replacement')

    def test_sparse_files_and_errors(self):
        path = self.a / 'sparse'
        fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_EXCL, 0o600)
        os.lseek(fd, 65537, os.SEEK_SET)
        os.write(fd, b'end')
        self.assertEqual(os.pread(fd, 5, 65535), b'\0\0end')
        os.ftruncate(fd, 1)
        os.ftruncate(fd, 65540)
        self.assertEqual(os.pread(fd, 5, 65535), b'\0' * 5)
        os.close(fd)
        with self.assertRaises(FileExistsError):
            os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        directory = self.a / 'dir'
        directory.mkdir()
        (directory / 'child').write_bytes(b'x')
        with self.assertRaises(OSError) as captured:
            directory.rmdir()
        self.assertEqual(captured.exception.errno, errno.ENOTEMPTY)

    def test_executable_and_modes(self):
        binary = self.a / 'true'
        shutil.copyfile('/usr/bin/true', binary)
        binary.chmod(0o755)
        subprocess.run([str(binary)], check=True)
        script = self.a / 'script'
        script.write_text('#!/bin/sh\nprintf executable')
        script.chmod(0o755)
        self.assertEqual(subprocess.check_output([str(script)]), b'executable')

    def unsupported_lock(self, path):
        with path.open('rb') as file:
            fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_mmap_and_unsupported_features(self):
        path = self.a / 'file'
        path.write_bytes(b'hello')
        observations = {}
        with path.open('rb') as file:
            try:
                with mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ) as mapping:
                    self.assertEqual(mapping[:], b'hello')
                    observations['readonly_mmap'] = 'supported'
            except OSError as error:
                observations['readonly_mmap'] = error.errno
        with path.open('r+b') as file:
            with self.assertRaises(OSError) as captured:
                mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_WRITE)
            observations['writable_mmap'] = captured.exception.errno
        for name, action in [
            ('symlink', lambda: os.symlink('file', self.a / 'symlink')),
            ('hardlink', lambda: os.link(path, self.a / 'hardlink')),
            ('xattr', lambda: os.setxattr(path, 'user.test', b'x')),
            ('flock', lambda: self.unsupported_lock(path)),
            ('statfs', lambda: os.statvfs(path)),
        ]:
            with self.assertRaises(OSError) as captured:
                action()
            observations[name] = captured.exception.errno
        records.append({'compatibility': observations})


suite = unittest.defaultTestLoader.loadTestsFromTestCase(UnixTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'tests_run': result.testsRun, 'failures': [(str(test), trace) for test, trace in result.failures], 'errors': [(str(test), trace) for test, trace in result.errors], 'records': records}, indent=2) + '\n')
raise SystemExit(0 if result.wasSuccessful() else 1)
