## video_demo

Complete example that goes with youtube demo in toplevel readme.

## math.dust

* Teaches GPT-3 math based on dataset in https://github.com/hendrycks/math

* uses the training split, coalesced in one JSONL
* Uses randomization of the training dataset to maximize model's ability to learn math within limited context size in GPT-3
* Using consensus to cover more ground
* GPT-3 jumps from 10% to 30% pass rate using this technique