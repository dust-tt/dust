import json
import pathlib
import tempfile
import tracemalloc
import unittest

from sampled_result import write_sampled_result


class SampledResultTest(unittest.TestCase):
    def test_empty_samples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            samples = root / 'samples.jsonl'
            samples.touch()
            output = root / 'result.json'
            write_sampled_result(output, {}, samples)
            self.assertEqual(json.loads(output.read_text()), {'memory_samples': []})

    def test_complete_history_uses_bounded_memory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            samples = root / 'samples.jsonl'
            count = 30000
            with samples.open('w') as output:
                for index in range(count):
                    output.write(json.dumps({'time_ns': index, 'memory.stat': {str(key): key for key in range(64)}}) + '\n')
            summary = {'passed': True, 'sampling_errors': [], 'rows': [{'phase': 'first', 'result': 'OK'}]}
            output = root / 'result.json'
            tracemalloc.start()
            try:
                write_sampled_result(output, summary, samples)
                _, peak_bytes = tracemalloc.get_traced_memory()
            finally:
                tracemalloc.stop()
            self.assertLess(peak_bytes, 1 << 20)
            with output.open() as source:
                result = json.load(source)
            history = result.pop('memory_samples')
            self.assertEqual(result, summary)
            self.assertEqual([point['time_ns'] for point in history], list(range(count)))
            self.assertTrue(all(point['memory.stat'] == {str(key): key for key in range(64)} for point in history))


if __name__ == '__main__':
    unittest.main()
