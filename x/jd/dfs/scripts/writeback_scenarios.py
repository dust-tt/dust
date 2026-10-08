#!/usr/bin/env python3
import argparse
import errno
import json
import mmap
import os
import pathlib
import signal
import subprocess
import tempfile
import time
import unittest

parser = argparse.ArgumentParser()
parser.add_argument('mount_a', type=pathlib.Path)
parser.add_argument('mount_b', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
records = []


def wait_for(predicate, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except OSError as error:
            if error.errno not in (errno.ENOENT, errno.ESTALE):
                raise
        time.sleep(0.01)
    raise AssertionError('reconciliation deadline exceeded')


def open_after_release(path):
    deadline = time.monotonic() + 10
    while True:
        try:
            return os.open(path, os.O_RDWR)
        except OSError as error:
            if error.errno != errno.EBUSY or time.monotonic() >= deadline:
                raise
            time.sleep(0.01)


class WritebackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_a = pathlib.Path(tempfile.mkdtemp(prefix='writeback-', dir=args.mount_a / 'files'))
        cls.root_b = args.mount_b / 'files' / cls.root_a.name
        wait_for(cls.root_b.is_dir)

    def setUp(self):
        self.started = time.perf_counter_ns()
        self.a = self.root_a / self._testMethodName
        self.b = self.root_b / self._testMethodName
        self.a.mkdir()
        wait_for(self.b.is_dir)

    def tearDown(self):
        records.append({'test': self._testMethodName, 'elapsed_ms': (time.perf_counter_ns() - self.started) / 1e6})

    def descriptor(self, path, flags, allow_retired=False):
        fd = os.open(path, flags, 0o600)
        def close():
            try:
                os.close(fd)
            except OSError as error:
                if not allow_retired or error.errno not in (errno.ESTALE, errno.EIO):
                    raise
                records.append({'retired_close_errno': error.errno})
        self.addCleanup(close)
        return fd

    def test_remote_cached_reader_observes_publications_and_writer_is_fenced(self):
        local = self.descriptor(self.a / 'file', os.O_CREAT | os.O_RDWR)
        os.write(local, b'original')
        os.fsync(local)
        wait_for(lambda: (self.b / 'file').read_bytes() == b'original')
        remote = self.descriptor(self.b / 'file', os.O_RDONLY, allow_retired=True)
        self.assertEqual(os.pread(remote, 8, 0), b'original')
        with self.assertRaises(OSError) as captured:
            os.open(self.b / 'file', os.O_WRONLY)
        self.assertEqual(captured.exception.errno, errno.EBUSY)
        os.pwrite(local, b'changed!', 0)
        os.fsync(local)
        def retired(fd):
            try:
                os.pread(fd, 8, 0)
                return False
            except OSError as error:
                self.assertIn(error.errno, (errno.ESTALE, errno.EIO))
                records.append({'retired_read_errno': error.errno})
                return True
        wait_for(lambda: retired(remote))
        wait_for(lambda: (self.b / 'file').read_bytes() == b'changed!')
        with self.assertRaises(OSError) as captured:
            os.fstat(remote)
        self.assertEqual(captured.exception.errno, errno.ESTALE)
        os.ftruncate(local, 3)
        os.fsync(local)
        wait_for(lambda: (self.b / 'file').stat().st_size == 3 and (self.b / 'file').read_bytes() == b'cha')

    def test_remote_rename_and_replacement_preserve_old_dirty_handle(self):
        local = self.descriptor(self.a / 'source', os.O_CREAT | os.O_RDWR)
        os.write(local, b'old-inode')
        os.fsync(local)
        wait_for(lambda: (self.b / 'source').exists())
        os.pwrite(local, b'dirty-old', 0)
        os.rename(self.b / 'source', self.b / 'renamed')
        wait_for(lambda: (self.a / 'renamed').exists() and not (self.a / 'source').exists())
        os.fsync(local)
        wait_for(lambda: (self.b / 'renamed').read_bytes() == b'dirty-old')
        (self.b / 'replacement').write_bytes(b'new-inode')
        os.replace(self.b / 'replacement', self.b / 'renamed')
        wait_for(lambda: (self.a / 'renamed').read_bytes() == b'new-inode')
        os.pwrite(local, b'still-old', 0)
        os.fsync(local)
        self.assertEqual(os.pread(local, 9, 0), b'still-old')
        self.assertEqual(os.fstat(local).st_nlink, 0)
        self.assertEqual((self.a / 'renamed').read_bytes(), b'new-inode')
        self.assertEqual((self.b / 'renamed').read_bytes(), b'new-inode')

    def test_remote_unlink_and_recreate_do_not_reuse_dirty_inode(self):
        local = self.descriptor(self.a / 'name', os.O_CREAT | os.O_RDWR)
        os.write(local, b'first')
        os.fsync(local)
        wait_for(lambda: (self.b / 'name').exists())
        os.pwrite(local, b'dirty', 0)
        (self.b / 'name').unlink()
        wait_for(lambda: not (self.a / 'name').exists())
        (self.b / 'name').write_bytes(b'replacement')
        wait_for(lambda: (self.a / 'name').exists())
        os.fsync(local)
        self.assertEqual(os.pread(local, 5, 0), b'dirty')
        self.assertEqual(os.fstat(local).st_nlink, 0)
        self.assertEqual((self.a / 'name').read_bytes(), b'replacement')

    def test_mapping_retains_exclusive_ownership_after_descriptor_close(self):
        (self.a / 'mapped').write_bytes(bytes(4096))
        wait_for(lambda: (self.b / 'mapped').exists())
        fd = os.open(self.a / 'mapped', os.O_RDWR)
        mapping = mmap.mmap(fd, 4096, access=mmap.ACCESS_WRITE)
        os.close(fd)
        try:
            mapping[:6] = b'mapped'
            with self.assertRaises(OSError) as captured:
                os.open(self.b / 'mapped', os.O_WRONLY)
            self.assertEqual(captured.exception.errno, errno.EBUSY)
            mapping.flush()
            wait_for(lambda: (self.b / 'mapped').read_bytes()[:6] == b'mapped')
        finally:
            mapping.close()
        remote = open_after_release(self.b / 'mapped')
        try:
            os.pwrite(remote, b'remote', 0)
            os.fsync(remote)
            wait_for(lambda: (self.a / 'mapped').read_bytes()[:6] == b'remote')
        finally:
            os.close(remote)

    def test_remote_change_retires_readonly_mapping_and_reopen_recovers(self):
        (self.a / 'readonly-map').write_bytes(b'x' * 4096)
        wait_for(lambda: (self.b / 'readonly-map').exists())
        child = subprocess.Popen([
            'python3', '-c',
            'import mmap,os,sys,time; f=open(sys.argv[1],"rb"); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ); assert m[:]==b"x"*4096; print("ready",flush=True); sys.stdin.readline(); deadline=time.monotonic()+5\nwhile time.monotonic()<deadline:\n assert m[0]==ord("x"); time.sleep(.01)\nraise AssertionError("retired mapping remained readable")',
            str(self.b / 'readonly-map'),
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'ready')
            local = self.descriptor(self.a / 'readonly-map', os.O_RDWR)
            os.pwrite(local, b'y' * 4096, 0)
            os.fsync(local)
            wait_for(lambda: (self.b / 'readonly-map').read_bytes() == b'y' * 4096)
            stdout, stderr = child.communicate('read\n', timeout=10)
            self.assertEqual(child.returncode, -signal.SIGBUS, (stdout, stderr))
            self.assertEqual((self.b / 'readonly-map').read_bytes(), b'y' * 4096)
            records.append({'retired_mapping_signal': 'SIGBUS', 'fresh_open_verified': True})
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()


suite = unittest.defaultTestLoader.loadTestsFromTestCase(WritebackTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({
    'tests_run': result.testsRun,
    'failures': [(str(test), trace) for test, trace in result.failures],
    'errors': [(str(test), trace) for test, trace in result.errors],
    'records': records,
}, indent=2) + '\n')
raise SystemExit(0 if result.wasSuccessful() else 1)
