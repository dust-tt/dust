import assert from 'assert';
import axios from 'axios';

describe('axios tests', () => {
  it('should create an axios instance', () => {
    const instance = axios.create();
    assert.ok(instance);
  });

  it('should have the expected version', () => {
    assert.ok(axios.VERSION);
    assert.strictEqual(axios.VERSION, '1.7.9');
  });
});
