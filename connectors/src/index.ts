
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverRouter } from './router.js';




const server = createHTTPServer({
  router: serverRouter,
});

console.log('serving client...')
server.listen(3002);

