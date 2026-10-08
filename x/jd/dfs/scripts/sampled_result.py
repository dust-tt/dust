import json


def write_sampled_result(path, summary, samples_path):
    assert 'memory_samples' not in summary
    with path.open('w') as output:
        output.write('{\n')
        for key, value in summary.items():
            json.dump(key, output)
            output.write(':')
            json.dump(value, output)
            output.write(',\n')
        output.write('"memory_samples":[\n')
        with samples_path.open() as samples:
            for index, line in enumerate(samples):
                if index:
                    output.write(',')
                output.write(line)
        output.write(']}\n')
