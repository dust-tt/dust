#!/bin/bash
while true; do
  (echo -ne "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: $(stat -c %s /tmp/token.json 2>/dev/null || echo 0)\r\n\r\n"; cat /tmp/token.json 2>/dev/null) | nc -l -p 9876 -q 1
done
