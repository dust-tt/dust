#include <node.h>

namespace {
void Initialize(v8::Local<v8::Object> target) {}
}

NODE_MODULE(unix_dgram, Initialize)
